package com.aurionxi.wallet.mainnet

/** Explicit public-field boundary. Unknown fields and malformed values are discarded on write AND export. */
internal object MainnetSupportEventPolicy {
  private val decimal = Regex("^(0|[1-9][0-9]{0,77})$")
  private val identifier = Regex("^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$")
  private val address = Regex("^0x[0-9a-fA-F]{40}$")
  private val hash = Regex("^0x[0-9a-fA-F]{64}$")
  fun clean(fields: Map<String, String>): Map<String, String> = fields.filter { (key, value) -> when (key) {
    "sender", "recipient" -> value.matches(address)
    "hash", "originalHash", "replacementHash" -> value.matches(hash)
    "operationId" -> value.matches(Regex("^[0-9a-f-]{36}$"))
    "nonce", "recordNonce", "pendingNonce", "latestNonce", "gas", "gasPriceWei", "amountWei", "minimumOutWei", "estimatedOutWei", "receivedAmountWei", "deviceTime", "quoteTime", "elapsedMs", "attemptCount", "recordCount" -> value.matches(decimal)
    "clockDeltaMs" -> value.matches(Regex("^-?[0-9]{1,18}$"))
    "httpStatus" -> value.matches(Regex("^[1-5][0-9]{2}$"))
    "errorCode" -> value.matches(Regex("^mainnet_[a-z0-9_]{1,80}$")) || value in setOf("replacement_nonce_already_consumed", "invalid_replacement_intent", "rate_limited")
    "stage", "outcome", "errorType", "journalState", "assetId", "outputAsset", "kind", "reason" -> value.matches(identifier)
    "lifecycleCurrent", "hasTransferDetails", "requestStarted", "submissionBarrier" -> value == "true" || value == "false"
    else -> false
  } }
}
