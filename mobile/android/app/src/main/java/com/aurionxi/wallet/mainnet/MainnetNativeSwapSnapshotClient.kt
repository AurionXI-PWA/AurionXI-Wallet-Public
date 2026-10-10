package com.aurionxi.wallet.mainnet

import java.net.HttpURLConnection
import java.net.URL
import java.math.BigInteger
import org.json.JSONObject

/** Fixed public-read endpoint only. Signed bytes, keys and calldata never enter the bridge. */
internal class MainnetNativeSwapSnapshotClient {
  fun read(sender: String, input: String, output: String, amount: String, reviewed: MainnetNativeIntentSemanticVerifier.ReviewedTransfer? = null): JSONObject {
    require(sender.matches(Regex("^0x[0-9a-fA-F]{40}$"))); MainnetNativeSwapPolicy.route(input,output); MainnetNativeSwapPolicy.number(amount)
    val request=JSONObject().put("senderAddress",sender.lowercase()).put("inputAsset",input).put("outputAsset",output).put("amountWei",amount)
    reviewed?.let { request.put("reviewedOperation",requireNotNull(it.swapOperation).json()).put("reviewedNonce",it.nonce.toString()).put("reviewedGas",it.gasLimit.toString()).put("reviewedGasPrice",it.gasPriceWei.toString()) }
    val connection=(URL(ENDPOINT).openConnection() as HttpURLConnection).apply { requestMethod="POST";connectTimeout=12000;readTimeout=20000;doOutput=true;setRequestProperty("Content-Type","application/json") }
    try {
      connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(request.toString()) }
      val status=connection.responseCode
      val body=(if(status in 200..299)connection.inputStream else connection.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
      require(body.length <= 16384)
      val json=JSONObject(body)
      if(status != 200) throw IllegalStateException(json.optString("error","swap_quote_unavailable"))
      require(json.getInt("chainId")==56 && json.getString("senderAddress").equals(sender,true) && json.getString("inputAsset")==input && json.getString("outputAsset")==output && json.getString("amountWei")==amount && json.getInt("walletFeeBps")==0)
      val serverTime=json.getLong("observedAt");val now=System.currentTimeMillis();require(kotlin.math.abs(now-serverTime) <= 120000) { "swap_device_clock" }
      json.put("observedAt",now) // local review TTL; service/chain timestamp checked independently
      val r=review(json)
      require(MainnetNativeSwapPolicy.validReview(r))
      if(reviewed != null)require(r.swapOperation==reviewed.swapOperation && r.nonce==reviewed.nonce && r.gasLimit<=reviewed.gasLimit && r.gasPriceWei<=reviewed.gasPriceWei)
      return json
    }finally{connection.disconnect()}
  }
  fun review(json: JSONObject): MainnetNativeIntentSemanticVerifier.ReviewedTransfer {
    val op=MainnetNativeSwapPolicy.parse(json.getJSONObject("operation"));val asset=MainnetNativeIntentSemanticVerifier.Asset.values().single { it.wireValue==op.inputAsset }
    return MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56,json.getString("senderAddress").lowercase(),json.getString("senderAddress").lowercase(),asset,MainnetNativeIntentSemanticVerifier.tokenContract(asset),if(op.kind=="reset")BigInteger.ZERO else MainnetNativeSwapPolicy.number(op.intentAmountWei),MainnetNativeSwapPolicy.number(json.getString("nonce"),true),MainnetNativeSwapPolicy.number(json.getString("gas")),MainnetNativeSwapPolicy.number(json.getString("gasPrice")),json.getLong("observedAt"),swapOperation=op)
  }
  private companion object { const val ENDPOINT="https://asia-south1-aurionxi.cloudfunctions.net/walletMainnetSwapQuote/v1/bsc-mainnet/swap-quote" }
}
