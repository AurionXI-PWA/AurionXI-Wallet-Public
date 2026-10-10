package com.aurionxi.wallet.mainnet

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainnetNativeNonceRecoveryPolicyTest {
  @Test
  fun `allows exactly one matching pre-submission record`() {
    listOf(
      MainnetEncryptedNonceJournal.State.RESERVED,
      MainnetEncryptedNonceJournal.State.SIGNING,
      MainnetEncryptedNonceJournal.State.SIGNED_UNVERIFIED,
      MainnetEncryptedNonceJournal.State.SIGNED,
    ).forEach { state ->
      assertTrue(MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(state, 7, 7, 7, 1))
    }
  }

  @Test
  fun `never discards submitted or terminal records`() {
    listOf(
      MainnetEncryptedNonceJournal.State.SUBMITTED,
      MainnetEncryptedNonceJournal.State.CONFIRMED,
      MainnetEncryptedNonceJournal.State.REVERTED,
      MainnetEncryptedNonceJournal.State.DROPPED,
    ).forEach { state ->
      assertFalse(MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(state, 7, 7, 7, 1))
    }
  }

  @Test
  fun `requires one record and exact reviewed and live nonce`() {
    val state = MainnetEncryptedNonceJournal.State.SIGNED
    assertFalse(MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(state, 7, 7, 7, 0))
    assertFalse(MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(state, 7, 7, 7, 2))
    assertFalse(MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(state, 7, 8, 7, 1))
    assertFalse(MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(state, 7, 7, 8, 1))
  }
}
