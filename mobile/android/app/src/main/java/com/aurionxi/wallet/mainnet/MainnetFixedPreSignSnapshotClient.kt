package com.aurionxi.wallet.mainnet

import org.json.JSONObject
import java.io.OutputStreamWriter
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/** Internal-only client: no React bridge, RPC URL, calldata, or signer. */
internal class MainnetFixedPreSignSnapshotClient {
  internal enum class Asset(val wireValue: String) { NATIVE_BNB("native-bnb"), ARXI("arxi"), USDT("usdt") }
  internal data class Request(val senderAddress: String, val recipientAddress: String, val asset: Asset, val amountWei: BigInteger, val replacesTransactionHash: String? = null, val replacementNonce: BigInteger? = null, val replacementKind: String? = null, val minimumGasPriceWei: BigInteger? = null)
  internal data class Snapshot(val chainId: Int, val senderAddress: String, val pendingNonce: BigInteger, val gasLimit: BigInteger, val gasPriceWei: BigInteger, val observedAt: String, val latestNonce: BigInteger? = null, val replacesTransactionHash: String? = null, val replacementNonce: BigInteger? = null, val replacementKind: String? = null)

  fun read(request: Request, observe: ((Map<String, String>) -> Unit)? = null): Snapshot {
    fun report(fields: Map<String, String>) { try { observe?.let { observer -> observer(fields) } } catch (_: Exception) { /* diagnostics never changes quote authority */ } }
    requireAddress(request.senderAddress, "sender")
    requireAddress(request.recipientAddress, "recipient")
    if (request.replacesTransactionHash == null) require(request.amountWei > BigInteger.ZERO && request.replacementNonce == null && request.replacementKind == null) { "Mainnet amount must be positive." }
    else require((if (request.replacementKind == "cancel") request.asset == Asset.NATIVE_BNB && request.amountWei == BigInteger.ZERO && request.senderAddress.equals(request.recipientAddress, true) else request.replacementKind == "speed-up" && request.amountWei > BigInteger.ZERO) && request.replacesTransactionHash.matches(Regex("^0x[0-9a-fA-F]{64}$")) && request.replacementNonce != null && request.replacementNonce >= BigInteger.ZERO)
    val connection = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"; connectTimeout = 12_000; readTimeout = 12_000; doOutput = true
      setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", "application/json")
    }
    try {
      val payload = JSONObject().apply {
        put("senderAddress", request.senderAddress.lowercase())
        put("recipientAddress", request.recipientAddress.lowercase())
        put("asset", request.asset.wireValue)
        put("amountWei", request.amountWei.toString())
        request.replacesTransactionHash?.let { put("replacesTransactionHash", it); put("replacementNonce", request.replacementNonce.toString()); put("replacementKind", request.replacementKind); request.minimumGasPriceWei?.let { price -> put("minimumGasPriceWei", price.toString()) } }
      }.toString()
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { it.write(payload) }
      val status = connection.responseCode
      report(mapOf("httpStatus" to status.toString()))
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val body = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
      if (status != HttpURLConnection.HTTP_OK) {
        val code = try { JSONObject(body).optString("error") } catch (_: Exception) { "" }
        throw MainnetPreSignSnapshotException(if (code in setOf("replacement_nonce_already_consumed", "invalid_replacement_intent", "rate_limited", "mainnet_chain_required")) code else "mainnet_presign_unavailable")
      }
      val snapshot = parseSnapshot(body, request.senderAddress)
      if (request.replacesTransactionHash != null) require(snapshot.replacesTransactionHash.equals(request.replacesTransactionHash, true) && snapshot.replacementKind == request.replacementKind && snapshot.replacementNonce == request.replacementNonce && snapshot.latestNonce == request.replacementNonce && snapshot.pendingNonce >= requireNotNull(snapshot.latestNonce))
      report(mapOf("pendingNonce" to snapshot.pendingNonce.toString(), "gas" to snapshot.gasLimit.toString(), "gasPriceWei" to snapshot.gasPriceWei.toString()) +
        (snapshot.latestNonce?.let { mapOf("latestNonce" to it.toString()) } ?: emptyMap()))
      return snapshot
    } finally { connection.disconnect() }
  }

  private fun parseSnapshot(body: String, expectedSender: String): Snapshot {
    val value = JSONObject(body)
    val chainId = value.optInt("chainId", -1)
    val sender = value.optString("senderAddress", "").lowercase()
    val pendingNonce = decimal(value.optString("pendingNonce", ""), "pending nonce")
    val gasLimit = decimal(value.optString("gasLimit", ""), "gas limit")
    val gasPriceWei = decimal(value.optString("gasPriceWei", ""), "gas price")
    val observedAt = value.optString("observedAt", "")
    require(chainId == 56) { "Mainnet chain verification failed." }
    require(sender == expectedSender.lowercase()) { "Mainnet sender verification failed." }
    require(gasLimit > BigInteger.ZERO && gasPriceWei > BigInteger.ZERO && observedAt.isNotBlank()) { "Invalid Mainnet pre-sign quote." }
    val cancelHash = value.optString("replacesTransactionHash").takeIf { it.isNotBlank() && it != "null" }
    return Snapshot(chainId, sender, pendingNonce, gasLimit, gasPriceWei, observedAt,
      if (cancelHash == null) null else decimal(value.optString("latestNonce"), "latest nonce"), cancelHash,
      if (cancelHash == null) null else decimal(value.optString("replacementNonce"), "replacement nonce"),
      if (cancelHash == null) null else value.getString("replacementKind"))
  }
  private fun decimal(value: String, label: String): BigInteger {
    require(DECIMAL_PATTERN.matches(value)) { "Invalid Mainnet $label." }; return BigInteger(value)
  }
  private fun requireAddress(value: String, label: String) { require(ADDRESS_PATTERN.matches(value)) { "Invalid Mainnet $label address." } }
  private companion object {
    const val ENDPOINT = "https://asia-south1-aurionxi.cloudfunctions.net/walletMainnetPreSignSnapshot/v1/bsc-mainnet/pre-sign-snapshot"
    val ADDRESS_PATTERN = Regex("^0x[a-fA-F0-9]{40}$")
    val DECIMAL_PATTERN = Regex("^(0|[1-9][0-9]{0,77})$")
  }
}

internal class MainnetPreSignSnapshotException(val publicCode: String) : IllegalStateException(when (publicCode) {
  "replacement_nonce_already_consumed" -> "This nonce is already consumed. Check both transaction receipts."
  "invalid_replacement_intent" -> "The original transaction no longer matches this replacement request. Check status."
  "rate_limited" -> "Fee requests are temporarily limited. Wait one minute and review again."
  "mainnet_chain_required" -> "The fee service did not verify BNB Smart Chain Mainnet."
  else -> "The replacement fee service is temporarily unavailable. Check status and review again."
})
