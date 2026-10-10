package com.aurionxi.wallet.mainnet

import java.math.BigInteger
import java.time.Instant

/** Builds the actual native fee review from journal authority and the fixed service's fresh quote. */
internal object MainnetNativeReplacementReviewBuilder {
  fun build(original: MainnetEncryptedNonceJournal.Reservation, kind: String,
    snapshot: MainnetFixedPreSignSnapshotClient.Snapshot, now: Long): MainnetNativeIntentSemanticVerifier.ReviewedTransfer {
    val nonce = BigInteger.valueOf(original.nonce)
    if (!(snapshot.chainId == 56 && snapshot.senderAddress.equals(original.senderAddress, true)
      && snapshot.latestNonce == nonce && snapshot.replacementNonce == nonce && snapshot.pendingNonce >= nonce
      && snapshot.replacesTransactionHash.equals(original.rawTransactionHash, true) && snapshot.replacementKind == kind)) throw MainnetReplacementReviewException("mainnet_replacement_identity_invalid")
    val asset = if (kind == "cancel") MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB
      else MainnetNativeIntentSemanticVerifier.Asset.values().single { it.wireValue == original.assetId }
    val serverTime = try { Instant.parse(snapshot.observedAt).toEpochMilli() } catch (_: Exception) { throw MainnetReplacementReviewException("mainnet_replacement_clock_invalid") }
    // Two synchronized clocks can still differ by milliseconds. Never extend review life into the future.
    if (!(serverTime <= now + 5_000 && now - serverTime < 30_000)) throw MainnetReplacementReviewException("mainnet_replacement_clock_invalid")
    val observedAt = minOf(serverTime, now)
    val review = MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56, original.senderAddress,
      if (kind == "cancel") original.senderAddress else requireNotNull(original.recipientAddress), asset,
      MainnetNativeIntentSemanticVerifier.tokenContract(asset), if (kind == "cancel") BigInteger.ZERO else BigInteger(requireNotNull(original.amountWei)),
      nonce, snapshot.gasLimit, snapshot.gasPriceWei, observedAt, original.rawTransactionHash, kind)
    if (!(snapshot.gasLimit == BigInteger.valueOf(if (asset == MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB) 21_000L else 160_000L)
      && snapshot.gasPriceWei > BigInteger.ZERO && snapshot.gasLimit * snapshot.gasPriceWei <= BigInteger("100000000000000")
      && MainnetNativeReplacementPolicy.matchesOriginal(review, original))) throw MainnetReplacementReviewException("mainnet_replacement_fee_or_intent_invalid")
    return review
  }
}

internal class MainnetReplacementReviewException(val publicCode: String) : IllegalArgumentException(publicCode)
