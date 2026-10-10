package com.aurionxi.wallet.mainnet

/** Mandatory guard carried from trusted review through the final key-use instruction. */
internal class MainnetNativeSigningBoundaryGuard(
  val lifecycleGeneration: Long,
  val reviewExpiresAtMillis: Long,
  private val lifecycleGuard: MainnetNativeLifecycleGuard,
  private val isCancelled: () -> Boolean,
  private val nowMillis: () -> Long = System::currentTimeMillis,
) {
  fun isActive(): Boolean = lifecycleGuard.isCurrent(lifecycleGeneration) && !isCancelled() && nowMillis() < reviewExpiresAtMillis
  fun requireActive() = require(isActive()) { "Native Mainnet signing operation expired or was cancelled." }
}
