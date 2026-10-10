package com.aurionxi.wallet.mainnet

/** Public journal metadata only; never exposes authorization or vault material. */
internal object MainnetNativeRecoveryDiagnostics {
  fun reason(records: List<MainnetEncryptedNonceJournal.Reservation>, reviewedNonce: Long, livePendingNonce: Long?): String = when {
    livePendingNonce == null -> "snapshot_unavailable"
    records.isEmpty() -> "clear"
    records.any { it.state == MainnetEncryptedNonceJournal.State.SUBMITTED } -> "submitted_receipt_required"
    records.size != 1 -> "multiple_records"
    records.single().nonce != reviewedNonce || records.single().nonce != livePendingNonce -> "nonce_mismatch"
    else -> "never_submitted_retry_available"
  }

  fun summary(records: List<MainnetEncryptedNonceJournal.Reservation>, reviewedNonce: Long, livePendingNonce: Long?): String {
    val entries = records.take(32).joinToString("; ") {
      "nonce=${it.nonce},state=${it.state.name},hash=${it.rawTransactionHash ?: "none"}"
    }
    return "recordCount=${records.size}; reviewedNonce=$reviewedNonce; livePendingNonce=${livePendingNonce ?: "unavailable"}; reason=${reason(records, reviewedNonce, livePendingNonce)}; records=[$entries]"
  }
}

internal class MainnetNonceRecoveryRequiredException(val diagnostics: String) :
  IllegalArgumentException("Mainnet nonce recovery is required.")
