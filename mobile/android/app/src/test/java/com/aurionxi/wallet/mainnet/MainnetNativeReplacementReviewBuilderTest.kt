package com.aurionxi.wallet.mainnet

import java.math.BigInteger
import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

class MainnetNativeReplacementReviewBuilderTest {
  private val now = 1_790_204_160_000L
  private val sender = "0x" + "1".repeat(40)
  private val recipient = "0x" + "2".repeat(40)
  private val hash = "0x" + "a".repeat(64)
  private val original = MainnetEncryptedNonceJournal.Reservation(senderAddress = sender, nonce = 6, reviewDigest = hash,
    authorizationId = "original", state = MainnetEncryptedNonceJournal.State.SUBMITTED, rawTransactionHash = hash,
    recipientAddress = recipient, assetId = "native-bnb", amountWei = "200000000000000", attemptCount = 1, createdAtMillis = now)
  private fun snapshot(kind: String, time: Long = now) = MainnetFixedPreSignSnapshotClient.Snapshot(56, sender,
    BigInteger.valueOf(6), BigInteger.valueOf(21_000), BigInteger("100000000"), Instant.ofEpochMilli(time).toString(),
    BigInteger.valueOf(6), hash, BigInteger.valueOf(6), kind)
  private fun rejects(block: () -> Unit) { try { block(); fail("Must reject invalid quote") } catch (_: IllegalArgumentException) {} }

  @Test fun `both BNB actions prepare the exact fee reviews matching the live incident shape`() {
    val retry = MainnetNativeReplacementReviewBuilder.build(original, "speed-up", snapshot("speed-up"), now)
    assertEquals(recipient, retry.recipientAddress); assertEquals(BigInteger("200000000000000"), retry.amountWei)
    val cancel = MainnetNativeReplacementReviewBuilder.build(original, "cancel", snapshot("cancel"), now)
    assertEquals(sender, cancel.recipientAddress); assertEquals(BigInteger.ZERO, cancel.amountWei)
    for (review in listOf(retry, cancel)) {
      assertEquals(BigInteger.valueOf(6), review.nonce); assertEquals(hash, review.replacesTransactionHash)
      assertNull(review.assetContract); assertTrue(MainnetNativeReplacementPolicy.matchesOriginal(review, original))
    }
  }
  @Test fun `small server clock lead cannot break either button or extend its review expiration`() {
    for (kind in listOf("cancel", "speed-up")) {
      val review = MainnetNativeReplacementReviewBuilder.build(original, kind, snapshot(kind, now + 1_000), now)
      assertEquals(now, review.observedAtMillis)
      assertEquals(now - 1_000, MainnetNativeReplacementReviewBuilder.build(original, kind, snapshot(kind, now - 1_000), now).observedAtMillis)
      rejects { MainnetNativeReplacementReviewBuilder.build(original, kind, snapshot(kind, now + 5_001), now) }
      rejects { MainnetNativeReplacementReviewBuilder.build(original, kind, snapshot(kind, now - 30_000), now) }
    }
  }
  @Test fun `wrong chain sender hash consumed nonce excessive fee and already settled originals cannot prepare`() {
    val live = snapshot("cancel")
    for (bad in listOf(live.copy(chainId = 97), live.copy(senderAddress = recipient), live.copy(replacesTransactionHash = "0x" + "b".repeat(64)),
      live.copy(latestNonce = BigInteger.valueOf(7)), live.copy(pendingNonce = BigInteger.valueOf(5)), live.copy(replacementKind = "speed-up"),
      live.copy(gasLimit = BigInteger.valueOf(21_001)), live.copy(gasPriceWei = BigInteger("1000000000000"))))
      rejects { MainnetNativeReplacementReviewBuilder.build(original, "cancel", bad, now) }
    rejects { MainnetNativeReplacementReviewBuilder.build(original.copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED), "cancel", live, now) }
  }
  @Test fun `diagnostic codes distinguish clock failure from identity and fee failure`() {
    fun code(snapshot: MainnetFixedPreSignSnapshotClient.Snapshot): String {
      try { MainnetNativeReplacementReviewBuilder.build(original, "cancel", snapshot, now); fail("Must reject") }
      catch (error: MainnetReplacementReviewException) { return error.publicCode }
      return "unexpected"
    }
    assertEquals("mainnet_replacement_identity_invalid", code(snapshot("cancel").copy(latestNonce = BigInteger.valueOf(7))))
    assertEquals("mainnet_replacement_clock_invalid", code(snapshot("cancel", now + 5_001)))
    assertEquals("mainnet_replacement_clock_invalid", code(snapshot("cancel").copy(observedAt = "malformed")))
    assertEquals("mainnet_replacement_fee_or_intent_invalid", code(snapshot("cancel").copy(gasPriceWei = BigInteger("1000000000000"))))
  }
}
