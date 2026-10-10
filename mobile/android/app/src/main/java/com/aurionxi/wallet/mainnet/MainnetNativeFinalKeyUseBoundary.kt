package com.aurionxi.wallet.mainnet

/**
 * Makes the durable SIGNING transition, then rechecks cancellation/expiry at
 * the final boundary before the supplied cryptographic operation can run.
 */
internal object MainnetNativeFinalKeyUseBoundary {
  fun <T> execute(
    markSigning: () -> Boolean,
    onSigningStateDurable: () -> Unit,
    requireActive: () -> Unit,
    cryptographicUse: () -> T,
  ): T {
    require(markSigning()) { "Mainnet signing boundary journal failed." }
    onSigningStateDurable()
    requireActive()
    return cryptographicUse()
  }
}
