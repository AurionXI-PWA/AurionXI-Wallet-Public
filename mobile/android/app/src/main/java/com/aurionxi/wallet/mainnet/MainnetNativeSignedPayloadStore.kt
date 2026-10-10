package com.aurionxi.wallet.mainnet

import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/** Process-local, single-use signed payload store. Raw bytes never cross the React bridge. */
internal class MainnetNativeSignedPayloadStore {
  data class Entry(
    val rawTransaction: String,
    val transactionHash: String,
    val review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer,
    val reviewDigest: String,
    val authorizationId: String,
    val expiresAtMillis: Long,
    val sendApproved: Boolean = false,
  )

  private val entries = ConcurrentHashMap<String, Entry>()
  private val random = SecureRandom()

  fun issue(entry: Entry, now: Long): String {
    require(entry.expiresAtMillis > now && entry.transactionHash.matches(HASH))
    purge(now)
    val bytes = ByteArray(32).also(random::nextBytes)
    val handle = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    entries[handle] = entry
    return handle
  }

  fun consume(handle: String, expectedHash: String, now: Long): Entry? {
    if (!handle.matches(HANDLE) || !expectedHash.matches(HASH)) return null
    val entry = entries.remove(handle) ?: return null
    return entry.takeIf { now < it.expiresAtMillis && it.transactionHash.equals(expectedHash, true) }
  }

  fun invalidate(handle: String) {
    if (handle.matches(HANDLE)) entries.remove(handle)
  }

  fun invalidateAll() = entries.clear()
  internal fun isEmpty() = entries.isEmpty()
  private fun purge(now: Long) = entries.entries.removeIf { it.value.expiresAtMillis <= now }
  private companion object { val HANDLE = Regex("^[0-9a-f]{64}$"); val HASH = Regex("^0x[0-9a-fA-F]{64}$") }
}
