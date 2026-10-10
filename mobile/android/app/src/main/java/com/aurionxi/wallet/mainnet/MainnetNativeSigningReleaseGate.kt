package com.aurionxi.wallet.mainnet

import com.aurionxi.wallet.BuildConfig
import java.math.BigInteger

/** Native default-deny gate for an exact, time-limited Direct proof build. */
internal object MainnetNativeSigningReleaseGate {
  private fun isControlledProofReleased(): Boolean = BuildConfig.CONTROLLED_PROOF_ENABLED && try {
    BuildConfig.CONTROLLED_PROOF_ASSET == "arxi"
      && BuildConfig.CONTROLLED_PROOF_SENDER.matches(ADDRESS)
      && BuildConfig.CONTROLLED_PROOF_RECIPIENT.matches(ADDRESS)
      && positive(BuildConfig.CONTROLLED_PROOF_AMOUNT_WEI) > BigInteger.ZERO
      && positive(BuildConfig.CONTROLLED_PROOF_MAX_FEE_WEI) > BigInteger.ZERO
      && positive(BuildConfig.CONTROLLED_PROOF_EXPIRES_AT_EPOCH_MS) >= BigInteger.valueOf(System.currentTimeMillis())
  } catch (_: Exception) { false }

  fun isReleased(): Boolean {
    val proof = isControlledProofReleased()
    val production = MainnetNativeDirectProductionPolicy.isReleased()
    return proof.xor(production)
  }

  fun requireReleased(review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer) {
    if (review.swapOperation != null) {
      if (!MainnetNativeSwapPolicy.isReleased() || !MainnetNativeSwapPolicy.validReview(review)) throw SecurityException("Swap is not released for this exact operation.")
      return
    }
    if (!isReleased()) throw SecurityException("Mainnet signing is not released.")
    if (MainnetNativeDirectProductionPolicy.isReleased()) {
      MainnetNativeDirectProductionPolicy.requireAllowed(review)
      return
    }
    val fee = review.gasLimit.multiply(review.gasPriceWei)
    if (!review.senderAddress.equals(BuildConfig.CONTROLLED_PROOF_SENDER, true)
      || !review.recipientAddress.equals(BuildConfig.CONTROLLED_PROOF_RECIPIENT, true)
      || review.asset != MainnetNativeIntentSemanticVerifier.Asset.ARXI
      || review.amountWei != positive(BuildConfig.CONTROLLED_PROOF_AMOUNT_WEI)
      || fee > positive(BuildConfig.CONTROLLED_PROOF_MAX_FEE_WEI)
    ) throw SecurityException("Mainnet transfer is outside the controlled proof policy.")
  }

  private fun positive(value: String): BigInteger { require(value.matches(DECIMAL)); return BigInteger(value) }
  private val ADDRESS = Regex("^0x[a-f0-9]{40}$")
  private val DECIMAL = Regex("^[1-9][0-9]{0,77}$")
}
