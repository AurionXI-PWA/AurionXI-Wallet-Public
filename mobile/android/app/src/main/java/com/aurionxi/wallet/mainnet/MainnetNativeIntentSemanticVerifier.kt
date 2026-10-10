package com.aurionxi.wallet.mainnet

import java.math.BigInteger

/** Native fixed-policy verification for a future Mainnet signer. */
internal object MainnetNativeIntentSemanticVerifier {
  internal enum class Asset(val wireValue: String, val symbol: String) {
    NATIVE_BNB("native-bnb", "BNB"), ARXI("arxi", "ARXI"), USDT("usdt", "USDT")
  }
  internal data class ReviewedTransfer(
    val chainId: Int,
    val senderAddress: String,
    val recipientAddress: String,
    val asset: Asset,
    val assetContract: String?,
    val amountWei: BigInteger,
    val nonce: BigInteger,
    val gasLimit: BigInteger,
    val gasPriceWei: BigInteger,
    val observedAtMillis: Long,
    val replacesTransactionHash: String? = null,
    val replacementKind: String? = null,
    val swapOperation: MainnetNativeSwapPolicy.Operation? = null,
  )
  internal data class UnsignedTransaction(val chainId: Int, val to: String, val valueWei: BigInteger, val data: String, val nonce: BigInteger, val gasLimit: BigInteger, val gasPriceWei: BigInteger)

  fun matches(review: ReviewedTransfer, transaction: UnsignedTransaction): Boolean {
    if (review.swapOperation != null) return MainnetNativeSwapPolicy.matches(review, transaction)
    if (!validReview(review) || !validTransaction(transaction)) return false
    if (review.chainId != MAINNET_CHAIN_ID || transaction.chainId != MAINNET_CHAIN_ID) return false
    if (review.nonce != transaction.nonce || review.gasLimit != transaction.gasLimit || review.gasPriceWei != transaction.gasPriceWei) return false
    return when (review.asset) {
      Asset.NATIVE_BNB -> transaction.to.equals(review.recipientAddress, true) && transaction.valueWei == review.amountWei && transaction.data == "0x"
      Asset.ARXI, Asset.USDT -> transaction.to.equals(tokenContract(review.asset), true) && transaction.valueWei == BigInteger.ZERO && transaction.data.equals(erc20TransferData(review.recipientAddress, review.amountWei), true)
    }
  }
  /** Re-decodes the produced bytes, recovers the signer, then reuses the same fixed policy. */
  fun matchesSignedRaw(review: ReviewedTransfer, rawTransaction: String, expectedSender: String): Boolean = try {
    val decoded = MainnetNativeLegacyTransactionVerifier.decode(rawTransaction)
    decoded.chainId == MAINNET_CHAIN_ID
      && decoded.senderAddress.equals(expectedSender, ignoreCase = true)
      && decoded.senderAddress.equals(review.senderAddress, ignoreCase = true)
      && matches(review, UnsignedTransaction(decoded.chainId, decoded.to, decoded.valueWei, decoded.data, decoded.nonce, decoded.gasLimit, decoded.gasPriceWei))
  } catch (_: Exception) { false }
  private fun validReview(review: ReviewedTransfer): Boolean {
    val contractMatches = when (review.asset) {
      Asset.NATIVE_BNB -> review.assetContract == null
      Asset.ARXI, Asset.USDT -> review.assetContract.equals(tokenContract(review.asset), ignoreCase = true)
    }
    return review.senderAddress.matches(ADDRESS) && review.recipientAddress.matches(ADDRESS) && !review.recipientAddress.equals(ZERO_ADDRESS, true)
      && contractMatches && (if (review.replacesTransactionHash == null) review.replacementKind == null && review.amountWei in BigInteger.ONE..UINT256_MAX else MainnetNativeReplacementPolicy.validReview(review)) && review.nonce in BigInteger.ZERO..MAX_NONCE
      && review.gasLimit in BigInteger.ONE..MAX_GAS_LIMIT && review.gasPriceWei in BigInteger.ONE..MAX_GAS_PRICE_WEI && review.observedAtMillis >= 0
  }
  private fun validTransaction(transaction: UnsignedTransaction) = transaction.to.matches(ADDRESS) && !transaction.to.equals(ZERO_ADDRESS, true)
    && transaction.valueWei in BigInteger.ZERO..UINT256_MAX && transaction.nonce in BigInteger.ZERO..MAX_NONCE
    && transaction.gasLimit in BigInteger.ONE..MAX_GAS_LIMIT && transaction.gasPriceWei in BigInteger.ONE..MAX_GAS_PRICE_WEI && DATA.matches(transaction.data)
  internal fun erc20TransferData(recipientAddress: String, amountWei: BigInteger) = "$ERC20_TRANSFER_SELECTOR${recipientAddress.removePrefix("0x").lowercase().padStart(64, '0')}${amountWei.toString(16).padStart(64, '0')}"
  internal fun tokenContract(asset: Asset): String? = when (asset) {
    Asset.NATIVE_BNB -> null
    Asset.ARXI -> ARXI_CONTRACT
    Asset.USDT -> USDT_CONTRACT
  }
  internal fun arxiContract(): String = ARXI_CONTRACT
  internal fun usdtContract(): String = USDT_CONTRACT
  private const val MAINNET_CHAIN_ID = 56
  private const val ARXI_CONTRACT = "0x6fFEC4860325f8bfB3F000354708A7d0caE4b250"
  private const val USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"
  private const val ERC20_TRANSFER_SELECTOR = "0xa9059cbb"
  private const val ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  private val UINT256_MAX = BigInteger.ONE.shiftLeft(256).subtract(BigInteger.ONE)
  private val MAX_NONCE = BigInteger.valueOf(Long.MAX_VALUE)
  private val MAX_GAS_LIMIT = BigInteger.valueOf(500_000L)
  private val MAX_GAS_PRICE_WEI = BigInteger("1000000000000")
  private val ADDRESS = Regex("^0x[a-fA-F0-9]{40}$")
  private val DATA = Regex("^0x(?:[0-9a-fA-F]{2})*$")
}
