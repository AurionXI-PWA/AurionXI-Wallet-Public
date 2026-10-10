package com.aurionxi.wallet.mainnet

import org.web3j.crypto.Hash
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.math.BigInteger
import java.nio.charset.StandardCharsets
import javax.crypto.Cipher

/**
 * Native-only ordering boundary for a future release. It has no React bridge.
 * A native biometric implementation must issue the authorization immediately
 * before this method is called; JS cannot construct or consume one.
 */
internal class MainnetNativeSigningCoordinator(
  private val registry: MainnetNativeAuthorizationRegistry,
  private val vault: MainnetNativeVaultMigration,
  private val journal: MainnetEncryptedNonceJournal,
) {
  private val preSignGate = MainnetNativePreSignGate(registry)
  private val signer = MainnetNativeTransactionSigner(vault, journal)

  internal data class Request(
    val review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer,
    val authorizationId: String,
    val authorizationEpoch: Long,
    val boundaryGuard: MainnetNativeSigningBoundaryGuard,
  )

  fun signAfterNativeAuthorization(request: Request, authenticatedCipher: Cipher): MainnetNativeTransactionSigner.SignedTransaction {
    request.boundaryGuard.requireActive()
    MainnetNativeSigningReleaseGate.requireReleased(request.review)
    if (request.review.swapOperation != null) return signSwap(request, authenticatedCipher)
    val digest = MainnetNativeReviewDigest.forTransfer(request.review)
    val recovery = journal.readRecoveryQueue(request.review.senderAddress)
    val asset = when (request.review.asset) {
      MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB -> MainnetFixedPreSignSnapshotClient.Asset.NATIVE_BNB
      MainnetNativeIntentSemanticVerifier.Asset.ARXI -> MainnetFixedPreSignSnapshotClient.Asset.ARXI
      MainnetNativeIntentSemanticVerifier.Asset.USDT -> MainnetFixedPreSignSnapshotClient.Asset.USDT
    }
    val snapshotRequest = MainnetFixedPreSignSnapshotClient.Request(request.review.senderAddress, request.review.recipientAddress, asset, request.review.amountWei, request.review.replacesTransactionHash, request.review.nonce.takeIf { request.review.replacesTransactionHash != null }, request.review.replacementKind, if (request.review.replacesTransactionHash == null) null else journal.readNonceAttempts(request.review.senderAddress, request.review.nonce.longValueExact()).mapNotNull { it.gasPriceWei?.let(::BigInteger) }.maxOrNull())
    val reviewedIntent = MainnetNativePreSignRevalidator.ReviewedIntent(request.review.chainId, request.review.senderAddress, request.review.nonce, request.review.gasLimit, request.review.gasPriceWei, request.review.replacesTransactionHash, request.review.replacementKind)
    val validated = requireNotNull(preSignGate.revalidateThenConsume(request.authorizationId, digest, request.authorizationEpoch, reviewedIntent, snapshotRequest, request.boundaryGuard)) { "Mainnet pre-sign validation failed." }
    if (request.review.replacesTransactionHash != null) {
      val original = requireNotNull(journal.read(request.review.senderAddress, request.review.nonce.longValueExact()))
      require(MainnetNativeReplacementPolicy.matchesOriginal(request.review, original)) { "Replacement no longer matches the original record." }
      val candidates = recovery.reservations.filter { it.replacesTransactionHash != null }
      require(recovery.reservations.all { it == original || MainnetNativeReplacementPolicy.related(original, it) }) { "Other nonce recovery is required." }
      candidates.filter { it.state != MainnetEncryptedNonceJournal.State.SUBMITTED }.forEach { candidate ->
        require(journal.markNeverSubmittedDropped(candidate, validated.snapshot.latestNonce!!.longValueExact())) { "Replacement receipt recovery is required." }
      }
    } else if (recovery.blocksNewAuthorization) {
      val livePendingNonce = validated.snapshot.pendingNonce.longValueExact()
      val stranded = recovery.reservations.singleOrNull()
      if (stranded == null || !MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(stranded.state, stranded.nonce, request.review.nonce.longValueExact(), livePendingNonce, recovery.reservations.size)) {
        throw MainnetNonceRecoveryRequiredException(MainnetNativeRecoveryDiagnostics.summary(recovery.reservations, request.review.nonce.longValueExact(), livePendingNonce))
      }
      require(journal.markNeverSubmittedDropped(stranded, livePendingNonce)) { "Mainnet submitted nonce recovery is required." }
    }
    request.boundaryGuard.requireActive()
    return signer.signReserved(request.review, digest, request.authorizationId, authenticatedCipher, request.boundaryGuard)
  }
  private fun signSwap(request: Request, authenticatedCipher: Cipher): MainnetNativeTransactionSigner.SignedTransaction {
    val review = request.review; val op = requireNotNull(review.swapOperation)
    request.boundaryGuard.requireActive()
    val start = android.os.SystemClock.elapsedRealtime()
    val snapshot = MainnetNativeSwapSnapshotClient().read(review.senderAddress, op.inputAsset, op.outputAsset, op.intentAmountWei, review)
    require(snapshot.optBoolean("executionEnabled") && android.os.SystemClock.elapsedRealtime() - start <= 10_000) { "Swap pre-sign validation failed." }
    request.boundaryGuard.requireActive()
    val recovery = journal.readRecoveryQueue(review.senderAddress)
    if (recovery.blocksNewAuthorization) {
      val stranded = recovery.reservations.singleOrNull()
      val pending = snapshot.getString("nonce").toLong()
      require(stranded != null && MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(stranded.state, stranded.nonce, review.nonce.longValueExact(), pending, recovery.reservations.size) && journal.markNeverSubmittedDropped(stranded, pending)) { "Mainnet nonce recovery is required." }
    }
    val digest = MainnetNativeReviewDigest.forTransfer(review)
    require(registry.consume(request.authorizationId, review.senderAddress, digest, request.authorizationEpoch, System.currentTimeMillis())) { "Swap authorization expired." }
    request.boundaryGuard.requireActive()
    return signer.signReserved(review, digest, request.authorizationId, authenticatedCipher, request.boundaryGuard)
  }
}

/** Canonical, native-generated binding for authorization and journal identity. */
internal object MainnetNativeReviewDigest {
  fun forTransfer(review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer): String {
    val contractMatchesAsset = when (review.asset) {
      MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB -> review.assetContract == null
      MainnetNativeIntentSemanticVerifier.Asset.ARXI, MainnetNativeIntentSemanticVerifier.Asset.USDT -> review.assetContract.equals(MainnetNativeIntentSemanticVerifier.tokenContract(review.asset), ignoreCase = true)
    }
    require(if (review.swapOperation != null) MainnetNativeSwapPolicy.validReview(review) else review.chainId == 56 && review.senderAddress.matches(ADDRESS) && review.recipientAddress.matches(ADDRESS) && contractMatchesAsset && (if (review.replacesTransactionHash == null) review.replacementKind == null && review.amountWei > BigInteger.ZERO else MainnetNativeReplacementPolicy.validReview(review)) && review.nonce >= BigInteger.ZERO && review.gasLimit > BigInteger.ZERO && review.gasPriceWei > BigInteger.ZERO && review.observedAtMillis >= 0) { "Invalid Mainnet review." }
    val fields = listOf(
      "aurionxi.mainnet.review.v1",
      "chainId", review.chainId.toString(),
      "sender", review.senderAddress.lowercase(),
      "assetId", review.asset.wireValue,
      "assetContract", review.assetContract?.lowercase() ?: "native",
      "recipient", review.recipientAddress.lowercase(),
      "amount", review.amountWei.toString(),
      "nonce", review.nonce.toString(),
      "gas", review.gasLimit.toString(),
      "gasPrice", review.gasPriceWei.toString(),
      "observedAt", review.observedAtMillis.toString(),
    )
    val operationFields = review.swapOperation?.let { fields + MainnetNativeSwapPolicy.digestFields(it) } ?: fields
    val boundFields = if (review.replacesTransactionHash == null) operationFields else fields + listOf("replacesTransactionHash", review.replacesTransactionHash.lowercase(), "replacementKind", requireNotNull(review.replacementKind))
    val encoded = ByteArrayOutputStream().also { output ->
      DataOutputStream(output).use { data ->
        boundFields.forEach { field ->
          val bytes = field.toByteArray(StandardCharsets.UTF_8)
          data.writeInt(bytes.size)
          data.write(bytes)
        }
      }
    }.toByteArray()
    return "0x" + Hash.sha3(encoded).joinToString("") { "%02x".format(it.toInt() and 0xff) }
  }
  private val ADDRESS = Regex("^0x[a-fA-F0-9]{40}$")
}
