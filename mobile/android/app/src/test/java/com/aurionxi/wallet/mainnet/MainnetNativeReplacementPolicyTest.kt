package com.aurionxi.wallet.mainnet

import java.math.BigInteger
import org.junit.Assert.*
import org.junit.Test
import org.web3j.crypto.*
import org.web3j.utils.Numeric

class MainnetNativeReplacementPolicyTest {
  private val credentials = Credentials.create(ECKeyPair.create(BigInteger.ONE))
  private val sender = credentials.address.lowercase()
  private val recipient = "0x2222222222222222222222222222222222222222"
  private val hash = "0x" + "a".repeat(64)
  private val nextHash = "0x" + "b".repeat(64)
  private val original = MainnetEncryptedNonceJournal.Reservation(senderAddress = sender, nonce = 6, reviewDigest = hash, authorizationId = "original", state = MainnetEncryptedNonceJournal.State.SUBMITTED, rawTransactionHash = hash, attemptCount = 1, recipientAddress = recipient, assetId = "usdt", amountWei = "1000000000000000001", createdAtMillis = 100)
  private fun review(kind: String) = MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56, sender, if (kind == "cancel") sender else recipient,
    if (kind == "cancel") MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB else MainnetNativeIntentSemanticVerifier.Asset.USDT,
    if (kind == "cancel") null else MainnetNativeIntentSemanticVerifier.usdtContract(), if (kind == "cancel") BigInteger.ZERO else BigInteger(requireNotNull(original.amountWei)),
    BigInteger.valueOf(6), BigInteger(if (kind == "cancel") "21000" else "160000"), BigInteger("100000000"), 100, hash, kind)
  private fun candidate(kind: String) = original.copy(authorizationId = "candidate", rawTransactionHash = nextHash, replacesTransactionHash = hash, replacementKind = kind,
    recipientAddress = if (kind == "cancel") sender else recipient, assetId = if (kind == "cancel") "native-bnb" else "usdt", amountWei = if (kind == "cancel") "0" else original.amountWei)

  @Test fun `Cancel binds zero self and Retry binds original asset recipient amount nonce sender and hash`() {
    for (kind in listOf("cancel", "speed-up")) {
      val r = review(kind)
      assertTrue(MainnetNativeReplacementPolicy.matchesOriginal(r, original))
      for (changed in listOf(r.copy(nonce = BigInteger.valueOf(7)), r.copy(senderAddress = recipient), r.copy(replacesTransactionHash = nextHash), r.copy(replacementKind = "other"))) assertFalse(MainnetNativeReplacementPolicy.matchesOriginal(changed, original))
      assertFalse(MainnetNativeReplacementPolicy.matchesOriginal(r, original.copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED)))
    }
    assertFalse(MainnetNativeReplacementPolicy.matchesOriginal(review("cancel").copy(amountWei = BigInteger.ONE), original))
    for (changed in listOf(review("speed-up").copy(amountWei = BigInteger.ONE), review("speed-up").copy(recipientAddress = sender), review("speed-up").copy(asset = MainnetNativeIntentSemanticVerifier.Asset.ARXI))) assertFalse(MainnetNativeReplacementPolicy.matchesOriginal(changed, original))
  }
  @Test fun `only terminal related winner can supersede original or replacement and keeps both hashes`() {
    for (kind in listOf("cancel", "speed-up")) for (terminal in listOf(MainnetEncryptedNonceJournal.State.CONFIRMED, MainnetEncryptedNonceJournal.State.REVERTED)) {
      val winner = candidate(kind).copy(state = terminal)
      val settled = MainnetNativeReplacementPolicy.superseded(original, winner)!!
      assertEquals(hash, settled.rawTransactionHash); assertEquals(nextHash, settled.cancelledByHash); assertEquals(original.amountWei, settled.amountWei)
      val losing = MainnetNativeReplacementPolicy.superseded(candidate(kind), original.copy(state = terminal))!!
      assertEquals(nextHash, losing.rawTransactionHash); assertEquals(hash, losing.cancelledByHash)
    }
    assertNull(MainnetNativeReplacementPolicy.superseded(original, candidate("cancel")))
    assertNull(MainnetNativeReplacementPolicy.superseded(original, candidate("cancel").copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED, nonce = 7)))
    assertNull(MainnetNativeReplacementPolicy.superseded(candidate("cancel").copy(state = MainnetEncryptedNonceJournal.State.RESERVED, rawTransactionHash = null), original.copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED)))
    assertNull(MainnetNativeReplacementPolicy.superseded(original.copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED), candidate("cancel").copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED)))
  }
  @Test fun `later replacement settles related earlier candidates and cannot settle another nonce`() {
    val earlier = candidate("cancel")
    val later = candidate("speed-up").copy(rawTransactionHash = "0x" + "c".repeat(64), state = MainnetEncryptedNonceJournal.State.CONFIRMED)
    assertEquals(later.rawTransactionHash, MainnetNativeReplacementPolicy.superseded(earlier, later)!!.cancelledByHash)
    assertNull(MainnetNativeReplacementPolicy.superseded(earlier, later.copy(nonce = 7)))
    assertNull(MainnetNativeReplacementPolicy.superseded(earlier, later.copy(state = MainnetEncryptedNonceJournal.State.SUBMITTED)))
  }
  @Test fun `cancellation signature is exact zero self on chain 56 and digest binds replacement metadata`() {
    val r = review("cancel")
    val raw = Numeric.toHexString(TransactionEncoder.signMessage(RawTransaction.createTransaction(r.nonce, r.gasPriceWei, r.gasLimit, sender, BigInteger.ZERO, "0x"), 56L, credentials))
    assertTrue(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(r, raw, sender))
    for (changed in listOf(r.copy(replacesTransactionHash = null, replacementKind = null), r.copy(recipientAddress = recipient), r.copy(amountWei = BigInteger.ONE), r.copy(asset = MainnetNativeIntentSemanticVerifier.Asset.USDT))) assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(changed, raw, sender))
    assertNotEquals(MainnetNativeReviewDigest.forTransfer(review("speed-up")), MainnetNativeReviewDigest.forTransfer(review("speed-up").copy(replacesTransactionHash = nextHash)))
  }
  @Test fun `replacement validates latest nonce even when original is in pending pool and retains ordinary pending nonce semantics`() {
    val r = MainnetNativePreSignRevalidator.ReviewedIntent(56, sender, BigInteger.valueOf(6), BigInteger("21000"), BigInteger("100000000"), hash, "cancel")
    val live = MainnetFixedPreSignSnapshotClient.Snapshot(56, sender, BigInteger.valueOf(7), r.gasLimit, r.gasPriceWei, "2026-10-05T10:00:00Z", BigInteger.valueOf(6), hash, BigInteger.valueOf(6), "cancel")
    assertTrue(MainnetNativePreSignRevalidator.matches(r, live))
    assertFalse(MainnetNativePreSignRevalidator.matches(r, live.copy(latestNonce = BigInteger.valueOf(7))))
    assertFalse(MainnetNativePreSignRevalidator.matches(r, live.copy(replacementKind = "speed-up")))
    assertFalse(MainnetNativePreSignRevalidator.matches(r.copy(replacesTransactionHash = null, replacementKind = null), live))
  }
}
