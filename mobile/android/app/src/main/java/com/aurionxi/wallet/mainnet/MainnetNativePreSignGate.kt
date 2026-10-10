package com.aurionxi.wallet.mainnet

/**
 * Native-only future signer gate. It deliberately performs a fresh fixed
 * snapshot read before consuming the one-time authorization. Any failure or
 * mismatch clears all authorizations. This class has no React bridge method.
 */
internal class MainnetNativePreSignGate(
  private val registry: MainnetNativeAuthorizationRegistry,
  private val snapshotClient: MainnetFixedPreSignSnapshotClient = MainnetFixedPreSignSnapshotClient(),
  private val nowMillis: () -> Long = System::currentTimeMillis,
) {
  internal data class Result(val snapshot: MainnetFixedPreSignSnapshotClient.Snapshot)

  fun revalidateThenConsume(
    authorizationId: String,
    reviewDigest: String,
    authorizationEpoch: Long,
    reviewedIntent: MainnetNativePreSignRevalidator.ReviewedIntent,
    snapshotRequest: MainnetFixedPreSignSnapshotClient.Request,
    boundaryGuard: MainnetNativeSigningBoundaryGuard,
  ): Result? {
    if (!reviewedIntent.senderAddress.equals(snapshotRequest.senderAddress, ignoreCase = true)) {
      registry.invalidateAll(); return null
    }
    return try {
      boundaryGuard.requireActive()
      val live = snapshotClient.read(snapshotRequest)
      boundaryGuard.requireActive()
      if (!MainnetNativePreSignRevalidator.matches(reviewedIntent, live)) {
        registry.invalidateAll(); null
      } else {
        // Check expiry after the network read so a slow or stalled snapshot
        // request cannot extend a biometric authorization's real lifetime.
        val consumed = registry.consume(authorizationId, reviewedIntent.senderAddress, reviewDigest, authorizationEpoch, nowMillis())
        boundaryGuard.requireActive()
        if (consumed) Result(live) else null
      }
    } catch (_: Exception) {
      registry.invalidateAll(); null
    }
  }
}
