package com.aurionxi.wallet.mainnet

/** Only positive evidence can release a first-attempt submission barrier.
 * A missing receipt or a network timeout is deliberately not such evidence.
 */
internal object MainnetNativeNonSubmissionPolicy {
  enum class Evidence { BEFORE_NETWORK_IO, PINNED_RELAY_REJECTED_BEFORE_RPC, UNKNOWN }
  fun mayRelease(record: MainnetEncryptedNonceJournal.Reservation, expectedHash: String, evidence: Evidence): Boolean =
    evidence != Evidence.UNKNOWN && record.state == MainnetEncryptedNonceJournal.State.SUBMITTED
      && record.attemptCount == 1 && record.rawTransactionHash?.equals(expectedHash, true) == true
}
