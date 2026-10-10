package com.aurionxi.wallet.mainnet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainnetNativeRecoveryDiagnosticsTest {
  private fun record(nonce: Long, state: MainnetEncryptedNonceJournal.State) = MainnetEncryptedNonceJournal.Reservation(
    senderAddress = "0x" + "1".repeat(40), nonce = nonce, reviewDigest = "0x" + "d".repeat(64),
    authorizationId = "authorization-must-not-be-exposed", state = state,
    rawTransactionHash = if (state == MainnetEncryptedNonceJournal.State.SUBMITTED) "0x" + "a".repeat(64) else null,
  )

  @Test
  fun `distinguishes submitted old nonce from reusable local record`() {
    val submitted = record(0, MainnetEncryptedNonceJournal.State.SUBMITTED)
    assertEquals("submitted_receipt_required", MainnetNativeRecoveryDiagnostics.reason(listOf(submitted), 1, 1))
    assertEquals("never_submitted_retry_available", MainnetNativeRecoveryDiagnostics.reason(listOf(record(1, MainnetEncryptedNonceJournal.State.RESERVED)), 1, 1))
    assertEquals("nonce_mismatch", MainnetNativeRecoveryDiagnostics.reason(listOf(record(0, MainnetEncryptedNonceJournal.State.RESERVED)), 1, 1))
    assertEquals("multiple_records", MainnetNativeRecoveryDiagnostics.reason(listOf(record(0, MainnetEncryptedNonceJournal.State.RESERVED), record(1, MainnetEncryptedNonceJournal.State.RESERVED)), 1, 1))
  }

  @Test
  fun `missing snapshot stays explicit even with an empty journal`() {
    assertEquals("snapshot_unavailable", MainnetNativeRecoveryDiagnostics.reason(emptyList(), 1, null))
    assertEquals("clear", MainnetNativeRecoveryDiagnostics.reason(emptyList(), 1, 1))
  }

  @Test
  fun `summary includes public record evidence and excludes authorization identity`() {
    val entry = record(0, MainnetEncryptedNonceJournal.State.SUBMITTED)
    val summary = MainnetNativeRecoveryDiagnostics.summary(listOf(entry), 1, 1)
    assertTrue(summary.contains("recordCount=1; reviewedNonce=1; livePendingNonce=1"))
    assertTrue(summary.contains("nonce=0,state=SUBMITTED,hash=${entry.rawTransactionHash}"))
    assertFalse(summary.contains(entry.authorizationId))
    assertFalse(summary.contains(entry.reviewDigest))
  }
}
