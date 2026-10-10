package com.aurionxi.wallet.mainnet

import java.math.BigInteger

/** Must run in native code immediately before any future key use. */
internal object MainnetNativePreSignRevalidator {
  internal data class ReviewedIntent(val chainId: Int, val senderAddress: String, val pendingNonce: BigInteger, val gasLimit: BigInteger, val gasPriceWei: BigInteger, val replacesTransactionHash: String? = null, val replacementKind: String? = null)
  internal fun matches(review: ReviewedIntent, live: MainnetFixedPreSignSnapshotClient.Snapshot): Boolean =
    review.chainId == 56 && live.chainId == 56
      && review.senderAddress.equals(live.senderAddress, ignoreCase = true)
      && (if (review.replacesTransactionHash == null) live.replacesTransactionHash == null && review.pendingNonce == live.pendingNonce
        else review.replacementKind in setOf("cancel", "speed-up") && review.replacementKind == live.replacementKind && review.replacesTransactionHash.equals(live.replacesTransactionHash, true) && review.pendingNonce == live.latestNonce && review.pendingNonce == live.replacementNonce && live.pendingNonce >= review.pendingNonce)
      && review.gasLimit == live.gasLimit
      && review.gasPriceWei == live.gasPriceWei
}
