package com.aurionxi.wallet.mainnet

import org.junit.Assert.*
import org.junit.Test

class MainnetNativeNonSubmissionPolicyTest {
  private val hash = "0x" + "a".repeat(64)
  private val record = MainnetEncryptedNonceJournal.Reservation(senderAddress = "0x" + "1".repeat(40), nonce = 1,
    reviewDigest = "0x" + "b".repeat(64), authorizationId = "test", state = MainnetEncryptedNonceJournal.State.SUBMITTED,
    rawTransactionHash = hash, attemptCount = 1)
  @Test fun `a timeout or absent receipt cannot release the submission barrier`() {
    assertFalse(MainnetNativeNonSubmissionPolicy.mayRelease(record, hash, MainnetNativeNonSubmissionPolicy.Evidence.UNKNOWN))
  }
  @Test fun `only positive first-attempt evidence releases the exact submitted record`() {
    listOf(MainnetNativeNonSubmissionPolicy.Evidence.BEFORE_NETWORK_IO, MainnetNativeNonSubmissionPolicy.Evidence.PINNED_RELAY_REJECTED_BEFORE_RPC).forEach { proof ->
      assertTrue(MainnetNativeNonSubmissionPolicy.mayRelease(record, hash, proof))
      assertFalse(MainnetNativeNonSubmissionPolicy.mayRelease(record.copy(attemptCount = 2), hash, proof))
      assertFalse(MainnetNativeNonSubmissionPolicy.mayRelease(record, "0x" + "c".repeat(64), proof))
      MainnetEncryptedNonceJournal.State.values().filter { it != MainnetEncryptedNonceJournal.State.SUBMITTED }.forEach { state ->
        assertFalse(MainnetNativeNonSubmissionPolicy.mayRelease(record.copy(state = state), hash, proof))
      }
    }
  }
}
