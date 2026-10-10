package com.aurionxi.wallet.mainnet

import org.web3j.crypto.RawTransaction
import org.web3j.crypto.Hash
import org.web3j.crypto.TransactionEncoder
import org.web3j.utils.Numeric
import javax.crypto.Cipher

/** Native-only signing primitive. No React bridge or broadcast method exists. */
internal class MainnetNativeTransactionSigner(
  private val vault: MainnetNativeVaultMigration,
  private val journal: MainnetEncryptedNonceJournal,
) {
  internal data class SignedTransaction(val rawTransaction: String, val rawTransactionHash: String)

  fun signReserved(review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer, reviewDigest: String, authorizationId: String, authenticatedCipher: Cipher, boundaryGuard: MainnetNativeSigningBoundaryGuard): SignedTransaction {
    boundaryGuard.requireActive()
    MainnetNativeSigningReleaseGate.requireReleased(review)
    require(reviewDigest.matches(Regex("^0x[0-9a-fA-F]{64}$")) && authorizationId.isNotBlank()) { "Invalid Mainnet signing authorization." }
    val policyProbe = if (review.swapOperation != null) MainnetNativeSwapPolicy.transaction(review) else when (review.asset) {
      MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB -> MainnetNativeIntentSemanticVerifier.UnsignedTransaction(56, review.recipientAddress, review.amountWei, "0x", review.nonce, review.gasLimit, review.gasPriceWei)
      MainnetNativeIntentSemanticVerifier.Asset.ARXI, MainnetNativeIntentSemanticVerifier.Asset.USDT -> MainnetNativeIntentSemanticVerifier.UnsignedTransaction(56, requireNotNull(MainnetNativeIntentSemanticVerifier.tokenContract(review.asset)), java.math.BigInteger.ZERO, MainnetNativeIntentSemanticVerifier.erc20TransferData(review.recipientAddress, review.amountWei), review.nonce, review.gasLimit, review.gasPriceWei)
    }
    require(MainnetNativeIntentSemanticVerifier.matches(review, policyProbe)) { "Mainnet signing policy rejected the review." }
    val reservation = MainnetEncryptedNonceJournal.Reservation(senderAddress = review.senderAddress, nonce = review.nonce.longValueExact(), reviewDigest = reviewDigest, authorizationId = authorizationId,
      recipientAddress = review.recipientAddress, assetId = review.asset.wireValue, amountWei = review.amountWei.toString(), createdAtMillis = System.currentTimeMillis(), replacesTransactionHash = review.replacesTransactionHash, replacementKind = review.replacementKind, gasPriceWei = review.gasPriceWei.toString(), swapOperationJson = review.swapOperation?.json()?.toString())
    boundaryGuard.requireActive()
    require((review.replacesTransactionHash != null || !journal.blocksNonce(review.senderAddress, review.nonce.longValueExact())) && journal.reserve(reservation)) { "Mainnet nonce is unavailable." }
    var crossedSigningBoundary = false
    return try {
      boundaryGuard.requireActive()
      vault.withDerivedCredentials(authenticatedCipher, boundaryGuard::requireActive) { credentials ->
        boundaryGuard.requireActive()
        require(credentials.address.equals(review.senderAddress, ignoreCase = true)) { "Native signer address mismatch." }
        val transaction = if (review.swapOperation != null) {
          val exact = MainnetNativeSwapPolicy.transaction(review)
          RawTransaction.createTransaction(exact.nonce, exact.gasPriceWei, exact.gasLimit, exact.to, exact.valueWei, exact.data)
        } else when (review.asset) {
          MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB -> RawTransaction.createTransaction(review.nonce, review.gasPriceWei, review.gasLimit, review.recipientAddress, review.amountWei, "0x")
          MainnetNativeIntentSemanticVerifier.Asset.ARXI, MainnetNativeIntentSemanticVerifier.Asset.USDT -> RawTransaction.createTransaction(review.nonce, review.gasPriceWei, review.gasLimit, requireNotNull(MainnetNativeIntentSemanticVerifier.tokenContract(review.asset)), java.math.BigInteger.ZERO, MainnetNativeIntentSemanticVerifier.erc20TransferData(review.recipientAddress, review.amountWei))
        }
        boundaryGuard.requireActive() // pre-journal check; persistence may race lifecycle invalidation
        val raw = MainnetNativeFinalKeyUseBoundary.execute(
          markSigning = { journal.markSigning(review.senderAddress, review.nonce.longValueExact(), reviewDigest, authorizationId, review.replacesTransactionHash) },
          onSigningStateDurable = { crossedSigningBoundary = true },
          requireActive = boundaryGuard::requireActive,
          cryptographicUse = { Numeric.toHexString(TransactionEncoder.signMessage(transaction, 56L, credentials)) },
        )
        val hash = Hash.sha3(raw)
        require(journal.markSignedUnverified(review.senderAddress, review.nonce.longValueExact(), reviewDigest, authorizationId, hash, review.replacesTransactionHash)) { "Mainnet signature journal failed." }
        require(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, raw, credentials.address)) { "Signed Mainnet transaction verification failed." }
        require(MainnetNativeLegacyTransactionVerifier.decode(raw).rawHash.equals(hash, ignoreCase = true)) { "Signed Mainnet transaction hash verification failed." }
        boundaryGuard.requireActive()
        require(journal.markSigned(review.senderAddress, review.nonce.longValueExact(), reviewDigest, authorizationId, hash, review.replacesTransactionHash)) { "Mainnet signing journal failed." }
        boundaryGuard.requireActive()
        SignedTransaction(raw, hash)
      }
    } catch (error: Exception) {
      if (!crossedSigningBoundary) {
        journal.markReservedDropped(review.senderAddress, review.nonce.longValueExact(), reviewDigest, authorizationId, review.replacesTransactionHash)
      }
      throw error
    }
  }
}
