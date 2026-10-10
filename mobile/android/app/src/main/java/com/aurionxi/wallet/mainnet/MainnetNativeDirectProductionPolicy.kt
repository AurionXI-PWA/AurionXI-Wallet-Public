package com.aurionxi.wallet.mainnet

import com.aurionxi.wallet.BuildConfig
import java.math.BigInteger

/** Independent native policy for the future audited Direct production release. */
internal object MainnetNativeDirectProductionPolicy {
  fun isReleased(): Boolean = BuildConfig.DIRECT_MAINNET_PRODUCTION_ENABLED && try {
    cap(BuildConfig.DIRECT_MAINNET_MAX_BNB_AMOUNT_WEI) > BigInteger.ZERO
      && cap(BuildConfig.DIRECT_MAINNET_MAX_ARXI_AMOUNT_WEI) > BigInteger.ZERO
      && cap(BuildConfig.DIRECT_MAINNET_MAX_FEE_WEI) > BigInteger.ZERO
  } catch (_: Exception) { false }

  fun requireAllowed(review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer) {
    if (!isReleased()) throw SecurityException("Direct Mainnet production policy is not released.")
    val amountCap = when (review.asset) {
      MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB -> cap(BuildConfig.DIRECT_MAINNET_MAX_BNB_AMOUNT_WEI)
      MainnetNativeIntentSemanticVerifier.Asset.ARXI -> cap(BuildConfig.DIRECT_MAINNET_MAX_ARXI_AMOUNT_WEI)
      MainnetNativeIntentSemanticVerifier.Asset.USDT -> cap(BuildConfig.DIRECT_MAINNET_MAX_USDT_AMOUNT_WEI)
    }
    val fee = review.gasLimit.multiply(review.gasPriceWei)
    if (amountCap <= BigInteger.ZERO || (if (review.replacesTransactionHash == null) review.amountWei <= BigInteger.ZERO else !MainnetNativeReplacementPolicy.validReview(review)) || review.amountWei > amountCap || fee > cap(BuildConfig.DIRECT_MAINNET_MAX_FEE_WEI)) {
      throw SecurityException("Mainnet transfer exceeds the audited Direct production policy.")
    }
  }

  private fun cap(value: String): BigInteger { require(value.matches(DECIMAL)); return BigInteger(value) }
  private val DECIMAL = Regex("^(0|[1-9][0-9]{0,77})$")
}
