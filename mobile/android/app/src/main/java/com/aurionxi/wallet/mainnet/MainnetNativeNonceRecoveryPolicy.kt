package com.aurionxi.wallet.mainnet

/** Pure policy for replacing a locally stranded, never-submitted nonce. */
internal object MainnetNativeNonceRecoveryPolicy {
  fun mayDiscardNeverSubmitted(
    state: MainnetEncryptedNonceJournal.State,
    journalNonce: Long,
    reviewedNonce: Long,
    livePendingNonce: Long,
    unresolvedCount: Int,
  ): Boolean =
    unresolvedCount == 1 &&
      journalNonce == reviewedNonce &&
      journalNonce == livePendingNonce &&
      state in setOf(
        MainnetEncryptedNonceJournal.State.RESERVED,
        MainnetEncryptedNonceJournal.State.SIGNING,
        MainnetEncryptedNonceJournal.State.SIGNED_UNVERIFIED,
        MainnetEncryptedNonceJournal.State.SIGNED,
      )
}
