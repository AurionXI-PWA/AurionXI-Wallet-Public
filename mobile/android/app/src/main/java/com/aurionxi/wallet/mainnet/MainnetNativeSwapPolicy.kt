package com.aurionxi.wallet.mainnet

import com.aurionxi.wallet.BuildConfig
import java.math.BigInteger
import org.json.JSONObject

/** Only these three exact-input router methods and exact router approvals may be signed. */
internal object MainnetNativeSwapPolicy {
  const val ROUTER = "0x10ed43c718714eb63d5aa57b78b54704e256024e"
  const val FACTORY = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73"
  const val ARXI = "0x6ffec4860325f8bfb3f000354708a7d0cae4b250"
  const val USDT = "0x55d398326f99059ff775485246999027b3197955"
  const val WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"
  const val ARXI_PAIR = "0xdf5ad8a9129f5c11655fa2576a3ec6d96d2b836a"
  const val BNB_PAIR = "0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae"
  data class Operation(val kind: String, val inputAsset: String, val outputAsset: String, val intentAmountWei: String,
    val minimumOutWei: String, val estimatedOutWei: String, val grossOutWei: String, val taxBps: String, val policyHash: String, val deadline: String) {
    fun json() = JSONObject().apply { put("kind",kind); put("inputAsset",inputAsset); put("outputAsset",outputAsset); put("intentAmountWei",intentAmountWei); put("minimumOutWei",minimumOutWei); put("estimatedOutWei",estimatedOutWei); put("grossOutWei",grossOutWei); put("taxBps",taxBps); put("policyHash",policyHash); put("deadline",deadline) }
  }
  fun parse(json: JSONObject): Operation {
    require(json.keys().asSequence().toSet() == setOf("kind","inputAsset","outputAsset","intentAmountWei","minimumOutWei","estimatedOutWei","grossOutWei","taxBps","policyHash","deadline"))
    return Operation(json.getString("kind"),json.getString("inputAsset"),json.getString("outputAsset"),json.getString("intentAmountWei"),json.getString("minimumOutWei"),json.getString("estimatedOutWei"),json.getString("grossOutWei"),json.getString("taxBps"),json.getString("policyHash"),json.getString("deadline")).also { require(valid(it)) }
  }
  fun isReleased() = BuildConfig.DIRECT_MAINNET_SWAP_ENABLED && MainnetNativeDirectProductionPolicy.isReleased()
  fun route(input: String, output: String): List<String> {
    require(input in ASSETS && output in ASSETS && input != output)
    return when {
      input == "native-bnb" && output == "arxi" -> listOf(WBNB,USDT,ARXI)
      input == "arxi" && output == "native-bnb" -> listOf(ARXI,USDT,WBNB)
      else -> listOf(token(input),token(output))
    }
  }
  fun token(asset: String) = when(asset) { "native-bnb" -> WBNB; "arxi" -> ARXI; "usdt" -> USDT; else -> error("Unsupported swap asset") }
  fun valid(o: Operation): Boolean = try {
    route(o.inputAsset,o.outputAsset)
    val amount = number(o.intentAmountWei); val min = number(o.minimumOutWei); val gross = number(o.grossOutWei); val net = number(o.estimatedOutWei); val tax = number(o.taxBps,true)
    o.kind in setOf("swap","approve","reset") && (o.kind == "swap" || o.inputAsset != "native-bnb") && amount > BigInteger.ZERO && min > BigInteger.ZERO && net in min..gross && tax + BigInteger.valueOf(600) < BigInteger.valueOf(10000)
      && min == gross.multiply(BigInteger.valueOf(9400).subtract(tax)).divide(BigInteger.valueOf(10000)) && number(o.deadline) > BigInteger.ZERO && o.policyHash.matches(Regex("^0x[0-9a-f]{64}$"))
  } catch (_: Exception) { false }
  fun validReview(r: MainnetNativeIntentSemanticVerifier.ReviewedTransfer): Boolean = try {
    val o = requireNotNull(r.swapOperation)
    val cap = BigInteger(when(o.inputAsset) { "native-bnb" -> BuildConfig.DIRECT_MAINNET_MAX_BNB_AMOUNT_WEI; "arxi" -> BuildConfig.DIRECT_MAINNET_MAX_ARXI_AMOUNT_WEI; else -> BuildConfig.DIRECT_MAINNET_MAX_USDT_AMOUNT_WEI })
    valid(o) && r.chainId == 56 && r.senderAddress.matches(ADDRESS) && r.recipientAddress.equals(r.senderAddress,true) && r.asset.wireValue == o.inputAsset && (if(r.asset == MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB) r.assetContract == null else r.assetContract.equals(MainnetNativeIntentSemanticVerifier.tokenContract(r.asset),true))
      && r.replacesTransactionHash == null && r.replacementKind == null && r.amountWei == (if(o.kind == "reset") BigInteger.ZERO else number(o.intentAmountWei)) && number(o.intentAmountWei) <= cap
      && r.nonce in BigInteger.ZERO..BigInteger.valueOf(9_007_199_254_740_991L) && r.gasLimit in BigInteger.ONE..BigInteger.valueOf(500000) && r.gasPriceWei in BigInteger.ONE..BigInteger("1000000000000")
      && r.gasLimit.multiply(r.gasPriceWei) <= BigInteger(BuildConfig.DIRECT_MAINNET_MAX_FEE_WEI) && r.observedAtMillis >= 0
  } catch (_: Exception) { false }
  fun transaction(r: MainnetNativeIntentSemanticVerifier.ReviewedTransfer): MainnetNativeIntentSemanticVerifier.UnsignedTransaction {
    require(validReview(r)); val o = requireNotNull(r.swapOperation); val amount = number(o.intentAmountWei)
    val to: String; val value: BigInteger; val data: String
    if(o.kind != "swap") { to = token(o.inputAsset); value = BigInteger.ZERO; data = "0x095ea7b3" + addressWord(ROUTER) + word(if(o.kind == "reset") BigInteger.ZERO else amount) }
    else {
      to = ROUTER; value = if(o.inputAsset == "native-bnb") amount else BigInteger.ZERO
      val path = route(o.inputAsset,o.outputAsset); val min = number(o.minimumOutWei); val deadline = number(o.deadline)
      val nativeInput = o.inputAsset == "native-bnb"
      // Fixed selectors are independently verified against ethers ABI fixtures for all six routes.
      val selector = if(nativeInput) "0xb6f9de95" else if(o.outputAsset == "native-bnb") "0x791ac947" else "0x5c11d795"
      val head = (if(nativeInput) "" else word(amount)) + word(min) + word(BigInteger.valueOf(if(nativeInput)128 else 160)) + addressWord(r.senderAddress) + word(deadline)
      data = selector + head + word(BigInteger.valueOf(path.size.toLong())) + path.joinToString("") { addressWord(it) }
    }
    return MainnetNativeIntentSemanticVerifier.UnsignedTransaction(56,to,value,data,r.nonce,r.gasLimit,r.gasPriceWei)
  }
  fun matches(r: MainnetNativeIntentSemanticVerifier.ReviewedTransfer, tx: MainnetNativeIntentSemanticVerifier.UnsignedTransaction): Boolean = try { val exact=transaction(r); exact.copy(to=exact.to.lowercase(),data=exact.data.lowercase()) == tx.copy(to=tx.to.lowercase(),data=tx.data.lowercase()) } catch (_: Exception) { false }
  fun digestFields(o: Operation) = listOf("aurionxi.mainnet.swap.v1",o.kind,o.inputAsset,o.outputAsset,o.intentAmountWei,o.minimumOutWei,o.estimatedOutWei,o.grossOutWei,o.taxBps,o.policyHash,o.deadline)
  private fun word(n: BigInteger) = n.toString(16).padStart(64,'0').also { require(it.length == 64) }
  private fun addressWord(a: String) = a.removePrefix("0x").lowercase().padStart(64,'0')
  fun number(v: String, zero: Boolean = false) = BigInteger(v.also { require(it.matches(if(zero) Regex("^(0|[1-9][0-9]{0,77})$") else Regex("^[1-9][0-9]{0,77}$"))) }).also { require(it >= BigInteger.ZERO && it < BigInteger.ONE.shiftLeft(256)) }
  private val ADDRESS = Regex("^0x[0-9a-fA-F]{40}$")
  private val ASSETS = setOf("native-bnb","arxi","usdt")
}
