package com.aurionxi.wallet.mainnet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainnetNativeReceiptRecoveryPolicyTest {
  private val hash = "0x" + "a".repeat(64)

  @Test
  fun `only accepts receipt states bound to the exact journal hash`() {
    listOf("pending", "confirmed", "reverted", "unknown").forEach { state ->
      assertEquals(state, MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, "0x" + "A".repeat(64), state))
      assertNull(MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, "0x" + "b".repeat(64), state))
    }
  }

  @Test
  fun `missing malformed or dropped evidence never releases a submitted record`() {
    assertNull(MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, "", "confirmed"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.verifiedState("", hash, "confirmed"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, hash, "dropped"))
    assertEquals("unknown", MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, hash, "unknown"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(signedRecord().copy(state = MainnetEncryptedNonceJournal.State.SUBMITTED, attemptCount = 1), hash, "unknown"))
  }

  @Test
  fun `historical signed nonce zero is settled only by its own mined receipt`() {
    val oldHash = "0x8fd8bd00e6d991b005ada349716fb070b36108986e21d0993cdaadf8712b5fc1"
    val original = signedRecord().copy(nonce = 0, rawTransactionHash = oldHash)
    assertEquals(original.copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED),
      MainnetNativeReceiptRecoveryPolicy.terminalRecord(original, oldHash, "confirmed"))
    assertEquals(original.copy(state = MainnetEncryptedNonceJournal.State.REVERTED),
      MainnetNativeReceiptRecoveryPolicy.terminalRecord(original, oldHash, "reverted"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(original, hash, "confirmed"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(original, oldHash, "pending"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(original, oldHash, "dropped"))
  }

  @Test
  fun `receipt recovery accepts hash bearing unresolved states only`() {
    MainnetEncryptedNonceJournal.State.values().forEach { state ->
      val eligible = state in setOf(MainnetEncryptedNonceJournal.State.SIGNED_UNVERIFIED,
        MainnetEncryptedNonceJournal.State.SIGNED, MainnetEncryptedNonceJournal.State.SUBMITTED)
      assertEquals(eligible, MainnetNativeReceiptRecoveryPolicy.mayInspect(state))
      val original = signedRecord().copy(state = state,
        attemptCount = if (state == MainnetEncryptedNonceJournal.State.SUBMITTED) 2 else 0)
      val result = MainnetNativeReceiptRecoveryPolicy.terminalRecord(original, hash, "confirmed")
      if (eligible) {
        assertEquals(original.copy(state = MainnetEncryptedNonceJournal.State.CONFIRMED), result)
        assertEquals(original.attemptCount, result!!.attemptCount)
      } else assertNull(result)
    }
  }

  @Test
  fun `absent receipt hash and invalid submission provenance remain blocked`() {
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(signedRecord().copy(rawTransactionHash = null), hash, "confirmed"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(signedRecord(), "", "confirmed"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(signedRecord().copy(attemptCount = -1), hash, "confirmed"))
    assertNull(MainnetNativeReceiptRecoveryPolicy.terminalRecord(signedRecord().copy(state = MainnetEncryptedNonceJournal.State.SUBMITTED), hash, "confirmed"))
    assertTrue(MainnetNativeReceiptRecoveryPolicy.mayInspect(MainnetEncryptedNonceJournal.State.SIGNED))
    assertFalse(MainnetNativeReceiptRecoveryPolicy.mayInspect(MainnetEncryptedNonceJournal.State.RESERVED))
  }

  private fun signedRecord() = MainnetEncryptedNonceJournal.Reservation(
    senderAddress = "0x5c8b6a179e4584e90675aac12594435bab86e208", nonce = 0,
    reviewDigest = "0x" + "b".repeat(64), authorizationId = "legacy-native-authorization",
    state = MainnetEncryptedNonceJournal.State.SIGNED, rawTransactionHash = hash, attemptCount = 0,
  )
}
