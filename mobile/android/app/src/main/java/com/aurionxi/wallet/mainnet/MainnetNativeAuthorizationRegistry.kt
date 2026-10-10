package com.aurionxi.wallet.mainnet

import android.util.Base64
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * Native-only, one-use authorization registry. It is not exposed to the
 * React bridge. A future signer coordinator must issue/consume within one
 * native operation after it independently verifies device authentication.
 */
internal class MainnetNativeAuthorizationRegistry {
  private companion object {
    const val MAX_AUTHORIZATION_TTL_MILLIS = 60_000L
    val REVIEW_DIGEST_PATTERN = Regex("^0x[a-fA-F0-9]{64}$")
  }
  private data class Record(
    val senderAddress: String,
    val reviewDigest: String,
    val authorizationEpoch: Long,
    val expiresAtMillis: Long,
    var consumed: Boolean = false,
  )

  private val random = SecureRandom()
  private val records = ConcurrentHashMap<String, Record>()

  fun issue(senderAddress: String, reviewDigest: String, authorizationEpoch: Long, expiresAtMillis: Long, nowMillis: Long): String {
    require(senderAddress.matches(Regex("^0x[a-fA-F0-9]{40}$"))) { "Invalid Mainnet sender." }
    require(authorizationEpoch >= 0 && reviewDigest.matches(REVIEW_DIGEST_PATTERN) && expiresAtMillis > nowMillis && expiresAtMillis - nowMillis <= MAX_AUTHORIZATION_TTL_MILLIS) { "Invalid Mainnet authorization." }
    repeat(8) {
      val bytes = ByteArray(32)
      random.nextBytes(bytes)
      val id = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
      val inserted = records.putIfAbsent(id, Record(senderAddress.lowercase(), reviewDigest.lowercase(), authorizationEpoch, expiresAtMillis))
      if (inserted == null) return id
    }
    throw IllegalStateException("Unable to create a unique Mainnet authorization.")
  }

  fun consume(id: String, senderAddress: String, reviewDigest: String, authorizationEpoch: Long, nowMillis: Long): Boolean {
    val record = records[id] ?: return false
    synchronized(record) {
      if (record.consumed || nowMillis >= record.expiresAtMillis) return false
      if (record.senderAddress != senderAddress.lowercase() || record.reviewDigest != reviewDigest.lowercase() || record.authorizationEpoch != authorizationEpoch) return false
      record.consumed = true
      records.remove(id, record)
      return true
    }
  }

  fun invalidateAll() = records.clear()
}
