package com.aurionxi.wallet.mainnet

import org.junit.Assert.*
import org.junit.Test

class MainnetNativeReplacementRecoveryTest {
  private val hash = "0x" + "a".repeat(64)
  private fun record(nonce: Long) = MainnetEncryptedNonceJournal.Reservation(senderAddress = "0x" + "1".repeat(40), nonce = nonce,
    reviewDigest = hash, authorizationId = "legacy", state = MainnetEncryptedNonceJournal.State.SUBMITTED, rawTransactionHash = hash, attemptCount = 1)

  @Test fun `legacy success omitted from public history is settled before nonce six review`() {
    val old = record(1)
    val original = record(6).copy(rawTransactionHash = "0x" + "b".repeat(64))
    val settled = mutableListOf<Long>()
    MainnetNativeReplacementRecovery.reconcile(listOf(original, old), 6,
      inspect = { if (it.nonce == 1L) "confirmed" else "unknown" },
      settle = { item, state -> assertEquals("confirmed", state); settled.add(item.nonce); true }, requireActive = {})
    assertEquals(listOf(1L), settled)
    assertNull(old.recipientAddress) // Pre-metadata records are still recoverable by their exact native hash.
  }
  @Test fun `unknown and pending receipts cannot release any record`() {
    for (state in listOf("unknown", "pending")) {
      var changed = false
      MainnetNativeReplacementRecovery.reconcile(listOf(record(5), record(6)), 6,
        inspect = { state }, settle = { _, _ -> changed = true; true }, requireActive = {})
      assertFalse(changed)
    }
  }
  @Test fun `confirmed original is settled and a revert also consumes the nonce`() {
    for (state in listOf("confirmed", "reverted")) {
      var settled = false
      MainnetNativeReplacementRecovery.reconcile(listOf(record(6)), 6,
        inspect = { state }, settle = { item, receipt -> assertEquals(6L, item.nonce); assertEquals(state, receipt); settled = true; true }, requireActive = {})
      assertTrue(settled)
    }
  }
  @Test fun `future nonce and unsigned records are retained without pretending receipt recovery`() {
    val inspected = mutableListOf<Long>()
    MainnetNativeReplacementRecovery.reconcile(listOf(record(7), record(5).copy(state = MainnetEncryptedNonceJournal.State.RESERVED, rawTransactionHash = null)), 6,
      inspect = { inspected.add(it.nonce); "confirmed" }, settle = { _, _ -> fail("Must not settle"); false }, requireActive = {})
    assertTrue(inspected.isEmpty())
  }
  @Test fun `network failure stale write and lifecycle revocation stop preparation`() {
    for (kind in listOf("network", "write", "lifecycle")) {
      try {
        MainnetNativeReplacementRecovery.reconcile(listOf(record(1)), 6,
          inspect = { if (kind == "network") error("unavailable") else "confirmed" },
          settle = { _, _ -> kind != "write" }, requireActive = { if (kind == "lifecycle") error("revoked") })
        fail("Must stop preparation")
      } catch (_: IllegalStateException) {} catch (_: IllegalArgumentException) {}
    }
  }
}
