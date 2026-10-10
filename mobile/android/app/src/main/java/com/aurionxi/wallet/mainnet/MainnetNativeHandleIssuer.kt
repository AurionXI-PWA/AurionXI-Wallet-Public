package com.aurionxi.wallet.mainnet

/** Issues an opaque handle only while the native review remains active. */
internal class MainnetNativeHandleIssuer(
  private val payloadStore: MainnetNativeSignedPayloadStore,
  private val nowMillis: () -> Long = System::currentTimeMillis,
) {
  fun issue(
    entry: MainnetNativeSignedPayloadStore.Entry,
    boundaryGuard: MainnetNativeSigningBoundaryGuard,
    isCurrent: () -> Boolean,
  ): String {
    boundaryGuard.requireActive()
    require(isCurrent()) { "Native Mainnet signing operation is no longer current." }
    val handle = payloadStore.issue(entry, nowMillis())
    return try {
      boundaryGuard.requireActive()
      require(isCurrent()) { "Native Mainnet signing operation is no longer current." }
      handle
    } catch (error: Exception) {
      payloadStore.invalidate(handle)
      throw error
    }
  }
}
