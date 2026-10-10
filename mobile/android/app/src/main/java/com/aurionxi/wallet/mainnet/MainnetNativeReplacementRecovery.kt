package com.aurionxi.wallet.mainnet

/** Receipt-only recovery of older records, including legacy slots omitted from public history. */
internal object MainnetNativeReplacementRecovery {
  fun reconcile(records: List<MainnetEncryptedNonceJournal.Reservation>, nonce: Long,
    inspect: (MainnetEncryptedNonceJournal.Reservation) -> String,
    settle: (MainnetEncryptedNonceJournal.Reservation, String) -> Boolean,
    requireActive: () -> Unit) {
    require(records.size <= 32) { "Too many recovery records." }
    records.filter { it.nonce <= nonce && it.rawTransactionHash != null && MainnetNativeReceiptRecoveryPolicy.mayInspect(it.state) }
      .sortedBy { it.nonce }.forEach { record ->
        requireActive()
        val state = inspect(record)
        requireActive()
        if (state in setOf("confirmed", "reverted")) require(settle(record, state)) { "Recovery record changed." }
        // Pending/unknown evidence never clears a journal record.
      }
  }
}
