package com.aurionxi.wallet.mainnet

/** A terminal receipt is usable only for the exact locally recorded hash. */
internal object MainnetNativeReceiptRecoveryPolicy {
  fun mayInspect(state: MainnetEncryptedNonceJournal.State): Boolean = state in setOf(
    MainnetEncryptedNonceJournal.State.SIGNED_UNVERIFIED,
    MainnetEncryptedNonceJournal.State.SIGNED,
    MainnetEncryptedNonceJournal.State.SUBMITTED,
  )

  fun verifiedState(expectedHash: String, responseHash: String, state: String): String? {
    if (!HASH.matches(expectedHash) || !HASH.matches(responseHash) || !expectedHash.equals(responseHash, true)) return null
    return state.takeIf { it in setOf("pending", "unknown", "confirmed", "reverted") }
  }

  /** Chain evidence may outlive a legacy local submission transition. Never invent an attempt. */
  fun terminalRecord(record: MainnetEncryptedNonceJournal.Reservation, responseHash: String, state: String): MainnetEncryptedNonceJournal.Reservation? {
    if (!mayInspect(record.state) || record.attemptCount < 0 ||
      (record.state == MainnetEncryptedNonceJournal.State.SUBMITTED && record.attemptCount == 0)) return null
    val hash = record.rawTransactionHash ?: return null
    val terminal = when (verifiedState(hash, responseHash, state)) {
      "confirmed" -> MainnetEncryptedNonceJournal.State.CONFIRMED
      "reverted" -> MainnetEncryptedNonceJournal.State.REVERTED
      else -> return null
    }
    return record.copy(state = terminal)
  }
  private val HASH = Regex("^0x[0-9a-fA-F]{64}$")
}
