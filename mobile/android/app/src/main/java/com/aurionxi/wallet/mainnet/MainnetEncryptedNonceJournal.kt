package com.aurionxi.wallet.mainnet

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keystore-encrypted, process-atomic Mainnet nonce journal. It stores public
 * metadata only. Each replacement attempt occupies a separate encrypted slot. Original
 * records and hashes remain intact until an exact mined receipt consumes their nonce.
 */
internal class MainnetEncryptedNonceJournal(context: Context) {
  private val preferences = context.getSharedPreferences("aurionxi.mainnet.nonce-journal.v1", Context.MODE_PRIVATE)
  private val lock = Any()

  internal enum class State { RESERVED, SIGNING, SIGNED_UNVERIFIED, SIGNED, SUBMITTED, CONFIRMED, REVERTED, DROPPED, CANCELLED }
  data class Reservation(
    val chainId: Int = MAINNET_CHAIN_ID,
    val senderAddress: String,
    val nonce: Long,
    val reviewDigest: String,
    val authorizationId: String,
    val state: State = State.RESERVED,
    val rawTransactionHash: String? = null,
    val attemptCount: Int = 0,
    val recipientAddress: String? = null,
    val assetId: String? = null,
    val amountWei: String? = null,
    val createdAtMillis: Long = 0,
    val replacesTransactionHash: String? = null,
    val replacementKind: String? = null,
    val cancelledByHash: String? = null,
    val gasPriceWei: String? = null,
    val swapOperationJson: String? = null,
    val receivedAmountWei: String? = null,
  )

  /**
   * Records returned here are deliberately unresolved. A future coordinator
   * must reconcile them against Chain 56 before it can create another intent.
   * This prevents a process crash from silently reusing a nonce.
   */
  data class RecoveryQueue(val reservations: List<Reservation>) {
    val blocksNewAuthorization: Boolean get() = reservations.isNotEmpty()
  }

  fun reserve(reservation: Reservation): Boolean = synchronized(lock) {
    val record = normalize(reservation)
    validate(record)
    require(record.state == State.RESERVED && record.rawTransactionHash == null && record.attemptCount == 0) { "Invalid initial Mainnet reservation." }
    val key = keyForRecord(record)
    if (record.replacesTransactionHash != null) {
      val original = requireNotNull(read(record.senderAddress, record.nonce))
      require(original.state == State.SUBMITTED && MainnetNativeReplacementPolicy.related(original, record)) { "Original replacement record changed." }
      require(readRecoveryQueue(record.senderAddress).reservations.all { it == original || MainnetNativeReplacementPolicy.related(original, it) }) { "Other recovery records remain unresolved." }
    }
    val existing = preferences.getString(key, null)?.let { decode(decrypt(it, key)) }
    if (existing != null) {
      validate(existing)
      require(key == keyForRecord(existing)) { "Journal recovery key mismatch." }
      // A local signing failure marks the never-submitted reservation DROPPED.
      // Only that terminal state may be replaced for the same still-pending
      // nonce; unresolved or chain-observed states remain fail-closed.
      if (existing.state != State.DROPPED) return false
    }
    preferences.edit().putString(key, encrypt(encode(record), key)).commit()
  }

  fun read(senderAddress: String, nonce: Long): Reservation? = synchronized(lock) {
    val key = keyFor(senderAddress, nonce)
    val stored = preferences.getString(key, null) ?: return null
    val record = decode(decrypt(stored, key))
    validate(record)
    require(key == keyForRecord(record) && record.senderAddress == senderAddress.lowercase() && record.nonce == nonce) { "Journal record does not match its storage key." }
    record
  }

  fun readForHash(sender: String, nonce: Long, hash: String): Reservation? = synchronized(lock) {
    require(hash.matches(HASH))
    recordsForNonce(sender, nonce).singleOrNull { it.rawTransactionHash.equals(hash, true) }

  }

  /** Fail closed: malformed/decryption-failed data is surfaced, never ignored. */
  fun readRecoveryQueue(senderAddress: String): RecoveryQueue = synchronized(lock) {
    require(senderAddress.matches(ADDRESS)) { "Invalid Mainnet recovery sender." }
    val prefix = keyPrefixFor(senderAddress)
    val unresolved = preferences.all.entries
      .asSequence()
      .filter { (key, value) -> key.startsWith(prefix) && value is String }
      .map { (key, value) ->
        val record = decode(decrypt(value as String, key))
        validate(record)
        require(key == keyForRecord(record)) { "Journal recovery key mismatch." }
        record
      }
      .filter(::isUnresolved)
      .sortedBy { it.nonce }
      .toList()
    RecoveryQueue(unresolved)
  }

  fun blocksNonce(senderAddress: String, nonce: Long): Boolean = synchronized(lock) {
    read(senderAddress, nonce)?.let(::isUnresolved) ?: false
  }

  /** Durable public history survives a lost React promise or AsyncStorage failure. */
  fun readTransferHistory(senderAddress: String): List<Reservation> = synchronized(lock) {
    require(senderAddress.matches(ADDRESS))
    preferences.all.entries.filter { (key, value) -> key.startsWith(keyPrefixFor(senderAddress)) && value is String }
      .map { (key, value) -> decode(decrypt(value as String, key)).also { validate(it); require(key == keyForRecord(it)) } }
      .filter { it.rawTransactionHash != null && it.recipientAddress != null && it.assetId != null && it.amountWei != null && it.createdAtMillis > 0 }
      .sortedByDescending { it.createdAtMillis }.take(20)
  }

  /** Only a proven, first-attempt non-submission may release a submission barrier.
   * Callers hold the custody lease and must never use this after uncertain RPC acceptance.
   */
  fun markSubmissionNotSent(sender: String, nonce: Long, digest: String, authorizationId: String, rawHash: String,
    evidence: MainnetNativeNonSubmissionPolicy.Evidence, replacesTransactionHash: String? = null): Boolean = synchronized(lock) {
    val key = keyFor(sender, nonce, replacesTransactionHash, digest)
    val current = preferences.getString(key, null)?.let { decode(decrypt(it, key)) } ?: return false
    requireIdentity(current, sender, nonce, digest, authorizationId)
    if (!MainnetNativeNonSubmissionPolicy.mayRelease(current, rawHash, evidence)) return false
    val next = current.copy(state = State.DROPPED)
    validate(next)
    preferences.edit().putString(key, encrypt(encode(next), key)).commit()
  }

  /** Crossing this boundary makes the reservation permanently non-droppable. */
  fun markSigning(sender: String, nonce: Long, digest: String, authorizationId: String, replacesTransactionHash: String? = null): Boolean =
    update(sender, nonce, State.RESERVED, digest, authorizationId, replacesTransactionHash) { it.copy(state = State.SIGNING) }

  /** Record the hash immediately after the cryptographic instruction returns. */
  fun markSignedUnverified(sender: String, nonce: Long, digest: String, authorizationId: String, rawHash: String, replacesTransactionHash: String? = null): Boolean =
    update(sender, nonce, State.SIGNING, digest, authorizationId, replacesTransactionHash) { it.copy(state = State.SIGNED_UNVERIFIED, rawTransactionHash = rawHash.lowercase()) }

  fun markSigned(sender: String, nonce: Long, digest: String, authorizationId: String, rawHash: String, replacesTransactionHash: String? = null): Boolean =
    update(sender, nonce, State.SIGNED_UNVERIFIED, digest, authorizationId, replacesTransactionHash) {
      if (it.rawTransactionHash == rawHash.lowercase()) it.copy(state = State.SIGNED) else it
    }

  /** Cancellation rollback is legal only while no signature has been created. */
  fun markReservedDropped(sender: String, nonce: Long, digest: String, authorizationId: String, replacesTransactionHash: String? = null): Boolean =
    update(sender, nonce, State.RESERVED, digest, authorizationId, replacesTransactionHash) { it.copy(state = State.DROPPED) }

  /**
   * Abandons bytes that never crossed the native broadcast boundary. This is
   * intentionally unavailable for SUBMITTED records. The caller must first
   * obtain a fresh pending nonce from the fixed Chain-56 snapshot service and
   * prove that the chain still expects this exact nonce.
   *
   * Signed bytes are held only in the process-local payload store. Starting a
   * new trusted review invalidates that store, so a pre-SUBMITTED journal entry
   * cannot be broadcast by the application after process/UI recovery.
   */
  fun markNeverSubmittedDropped(record: Reservation, livePendingNonce: Long): Boolean = synchronized(lock) {
    if (!MainnetNativeNonceRecoveryPolicy.mayDiscardNeverSubmitted(record.state, record.nonce, record.nonce, livePendingNonce, 1)) return false
    val key = keyForRecord(record)
    val current = preferences.getString(key, null)?.let { decode(decrypt(it, key)) } ?: return false
    validate(current)
    if (current != record) return false
    val next = current.copy(state = State.DROPPED)
    validate(next)
    preferences.edit().putString(key, encrypt(encode(next), key)).commit()
  }

  /** Only the same signed bytes/hash can be submitted or retried. */
  fun markSubmitted(sender: String, nonce: Long, digest: String, authorizationId: String, rawHash: String, replacesTransactionHash: String? = null): Boolean = synchronized(lock) {
    val key = keyFor(sender, nonce, replacesTransactionHash, digest)
    val current = preferences.getString(key, null)?.let { decode(decrypt(it, key)) } ?: return false
    requireIdentity(current, sender, nonce, digest, authorizationId)
    if (current.state !in setOf(State.SIGNED, State.SUBMITTED) || current.rawTransactionHash != rawHash.lowercase()) return false
    val next = current.copy(state = State.SUBMITTED, attemptCount = current.attemptCount + 1)
    validate(next)
    preferences.edit().putString(key, encrypt(encode(next), key)).commit()
  }

  /** Exact-hash terminal receipt only; preserve historical state and attempt provenance. */
  fun markReceiptVerified(record: Reservation, responseHash: String, receiptState: String, receivedAmountWei: String? = null, operationEvidence: String? = null): Boolean = synchronized(lock) {
    validate(record)
    val key = keyForRecord(record)
    val current = preferences.getString(key, null)?.let { decode(decrypt(it, key)) } ?: return false
    validate(current)
    // Reconciliation cannot overwrite a record changed while its network request was pending.
    if (current != record) return false
    val terminal = MainnetNativeReceiptRecoveryPolicy.terminalRecord(current, responseHash, receiptState) ?: return false
    val op = current.swapOperationJson?.let { MainnetNativeSwapPolicy.parse(JSONObject(it)) }
    if (op != null && receiptState == "confirmed") {
      require(operationEvidence == op.kind) { "Operation receipt evidence is required." }
      if (op.kind == "swap") require(receivedAmountWei != null && MainnetNativeSwapPolicy.number(receivedAmountWei) >= MainnetNativeSwapPolicy.number(op.minimumOutWei))
    }
    val next = terminal.copy(receivedAmountWei = receivedAmountWei ?: current.receivedAmountWei)
    validate(next)
    val original = if (current.replacesTransactionHash == null) current else read(current.senderAddress, current.nonce)
    val editor = preferences.edit().putString(key, encrypt(encode(next), key))
    if (original != null) recordsForNonce(current.senderAddress, current.nonce).filter { it != current && (it == original || MainnetNativeReplacementPolicy.related(original, it)) }.forEach { other ->
      val superseded = MainnetNativeReplacementPolicy.superseded(other, next)
      if (superseded != null) { validate(superseded); val otherKey = keyForRecord(superseded); editor.putString(otherKey, encrypt(encode(superseded), otherKey)) }
    }
    editor.commit()
  }

  fun readNonceAttempts(sender: String, nonce: Long): List<Reservation> = synchronized(lock) { recordsForNonce(sender, nonce) }

  private fun recordsForNonce(sender: String, nonce: Long): List<Reservation> {
    val base = keyFor(sender, nonce)
    return preferences.all.entries.filter { (key, value) -> (key == base || key.startsWith("$base:replacement:")) && value is String }
      .map { (key, value) -> decode(decrypt(value as String, key)).also { validate(it); require(key == keyForRecord(it)) } }
  }

  private fun update(sender: String, nonce: Long, expected: State, digest: String, authorizationId: String, replacesTransactionHash: String? = null, mutate: (Reservation) -> Reservation): Boolean = synchronized(lock) {
    val key = keyFor(sender, nonce, replacesTransactionHash, digest)
    val current = preferences.getString(key, null)?.let { decode(decrypt(it, key)) } ?: return false
    requireIdentity(current, sender, nonce, digest, authorizationId)
    if (current.state != expected) return false
    val next = mutate(current)
    if (next == current) return false
    validate(next)
    preferences.edit().putString(key, encrypt(encode(next), key)).commit()
  }

  private fun requireIdentity(record: Reservation, sender: String, nonce: Long, digest: String, authorizationId: String) {
    validate(record)
    require(record.senderAddress == sender.lowercase() && record.nonce == nonce && record.reviewDigest == digest.lowercase() && record.authorizationId == authorizationId) { "Mainnet journal transition identity mismatch." }
  }

  private fun normalize(record: Reservation) = record.copy(senderAddress = record.senderAddress.lowercase(), reviewDigest = record.reviewDigest.lowercase(), rawTransactionHash = record.rawTransactionHash?.lowercase(), replacesTransactionHash = record.replacesTransactionHash?.lowercase(), cancelledByHash = record.cancelledByHash?.lowercase())
  private fun validate(record: Reservation) {
    require(record.chainId == MAINNET_CHAIN_ID && record.senderAddress.matches(ADDRESS) && record.nonce >= 0 && record.reviewDigest.matches(HASH) && record.authorizationId.isNotBlank() && record.attemptCount >= 0) { "Invalid Mainnet reservation." }
    if (record.state in setOf(State.RESERVED, State.SIGNING)) require(record.rawTransactionHash == null && record.attemptCount == 0) { "Invalid unsigned journal record." }
    if (record.state in setOf(State.SIGNED_UNVERIFIED, State.SIGNED, State.SUBMITTED, State.CONFIRMED, State.REVERTED, State.CANCELLED)) require(record.rawTransactionHash?.matches(HASH) == true) { "Signed record is missing its hash." }
    if (record.state == State.SUBMITTED) require(record.attemptCount >= 1) { "Submitted record has no attempt." }
    val hasDetails = record.recipientAddress != null || record.assetId != null || record.amountWei != null || record.createdAtMillis != 0L
    if (hasDetails) require(record.recipientAddress?.matches(ADDRESS) == true && record.assetId in setOf("native-bnb", "arxi", "usdt") && (if (record.swapOperationJson != null) record.amountWei?.matches(Regex("^(0|[1-9][0-9]{0,77})$")) == true else if (record.replacesTransactionHash == null) record.amountWei?.matches(Regex("^[1-9][0-9]{0,77}$")) == true else if (record.replacementKind == "cancel") record.amountWei == "0" && record.assetId == "native-bnb" && record.recipientAddress == record.senderAddress else record.replacementKind == "speed-up" && record.amountWei?.matches(Regex("^[1-9][0-9]{0,77}$")) == true) && record.createdAtMillis > 0) { "Invalid public transfer metadata." }
    if (record.replacesTransactionHash != null) require(record.replacesTransactionHash.matches(HASH) && record.replacementKind in setOf("cancel", "speed-up") && record.replacesTransactionHash != record.rawTransactionHash)
    else require(record.replacementKind == null)
    record.swapOperationJson?.let {
      val op = MainnetNativeSwapPolicy.parse(JSONObject(it))
      require(record.replacesTransactionHash == null && record.recipientAddress == record.senderAddress && record.assetId == op.inputAsset && record.amountWei == if(op.kind == "reset") "0" else op.intentAmountWei)
      if(record.state == State.CONFIRMED && op.kind == "swap") require(record.receivedAmountWei != null && MainnetNativeSwapPolicy.number(record.receivedAmountWei) >= MainnetNativeSwapPolicy.number(op.minimumOutWei))
    }
    if (record.gasPriceWei != null) require(record.gasPriceWei.matches(Regex("^[1-9][0-9]{0,77}$")))
    if (record.cancelledByHash != null) require(record.state == State.CANCELLED && record.cancelledByHash.matches(HASH))
    if (record.state == State.CANCELLED) require(record.cancelledByHash != null)
    // A hash-bound mined receipt can settle a legacy SIGNED record with zero
    // locally recorded submissions. Its terminal state must not fabricate one.
  }
  private fun keyForRecord(record: Reservation) = keyFor(record.senderAddress, record.nonce, record.replacesTransactionHash, record.reviewDigest)
  private fun keyFor(sender: String, nonce: Long, replacesTransactionHash: String? = null, digest: String? = null): String {
    require(sender.matches(ADDRESS) && nonce >= 0) { "Invalid Mainnet journal lookup." }
    require(replacesTransactionHash == null || (replacesTransactionHash.matches(HASH) && digest?.matches(HASH) == true))
    return "$MAINNET_CHAIN_ID:${sender.lowercase()}:$nonce" + (replacesTransactionHash?.let { ":replacement:${it.lowercase()}:${digest!!.lowercase()}" } ?: "")
  }
  private fun keyPrefixFor(sender: String): String {
    require(sender.matches(ADDRESS)) { "Invalid Mainnet recovery sender." }
    return "$MAINNET_CHAIN_ID:${sender.lowercase()}:"
  }
  private fun isUnresolved(record: Reservation): Boolean = record.state in setOf(State.RESERVED, State.SIGNING, State.SIGNED_UNVERIFIED, State.SIGNED, State.SUBMITTED)
  private fun encode(record: Reservation) = JSONObject().apply {
    put("chainId", record.chainId); put("senderAddress", record.senderAddress); put("nonce", record.nonce); put("reviewDigest", record.reviewDigest); put("authorizationId", record.authorizationId); put("state", record.state.name); if (record.rawTransactionHash != null) put("rawTransactionHash", record.rawTransactionHash); put("attemptCount", record.attemptCount)
    if (record.recipientAddress != null) { put("recipientAddress", record.recipientAddress); put("assetId", record.assetId); put("amountWei", record.amountWei); put("createdAtMillis", record.createdAtMillis) }
    if (record.replacesTransactionHash != null) { put("replacesTransactionHash", record.replacesTransactionHash); put("replacementKind", record.replacementKind) }
    if (record.cancelledByHash != null) put("cancelledByHash", record.cancelledByHash)
    if (record.gasPriceWei != null) put("gasPriceWei", record.gasPriceWei)
    record.swapOperationJson?.let { put("swapOperation", JSONObject(it)) }; record.receivedAmountWei?.let { put("receivedAmountWei", it) }
  }.toString()
  private fun decode(value: String): Reservation {
    val json = JSONObject(value)
    return Reservation(json.getInt("chainId"), json.getString("senderAddress"), json.getLong("nonce"), json.getString("reviewDigest"), json.getString("authorizationId"), State.valueOf(json.getString("state")), json.optString("rawTransactionHash").takeIf { it.isNotBlank() && it != "null" }, json.getInt("attemptCount"),
      json.optString("recipientAddress").takeIf { it.isNotBlank() && it != "null" }, json.optString("assetId").takeIf { it.isNotBlank() && it != "null" }, json.optString("amountWei").takeIf { it.isNotBlank() && it != "null" }, json.optLong("createdAtMillis", 0), if (json.has("replacesTransactionHash")) json.getString("replacesTransactionHash") else null, if (json.has("replacementKind")) json.getString("replacementKind") else null, if (json.has("cancelledByHash")) json.getString("cancelledByHash") else null, if (json.has("gasPriceWei")) json.getString("gasPriceWei") else null, if (json.has("swapOperation")) json.getJSONObject("swapOperation").toString() else null, if (json.has("receivedAmountWei")) json.getString("receivedAmountWei") else null)
  }
  private fun secretKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
    }.generateKey()
  }
  private fun encrypt(plaintext: String, storageKey: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey()); cipher.updateAAD(storageKey.toByteArray(StandardCharsets.UTF_8)); val encrypted = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8)); return Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)
  }
  private fun decrypt(encoded: String, storageKey: String): String {
    val bytes = Base64.decode(encoded, Base64.NO_WRAP); require(bytes.size > 12) { "Corrupt Mainnet nonce journal." }; val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))); cipher.updateAAD(storageKey.toByteArray(StandardCharsets.UTF_8)); return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), StandardCharsets.UTF_8)
  }
  private companion object {
    const val MAINNET_CHAIN_ID = 56
    const val KEY_ALIAS = "aurionxi.mainnet.nonce-journal.key.v1"
    val ADDRESS = Regex("^0x[a-fA-F0-9]{40}$")
    val HASH = Regex("^0x[a-fA-F0-9]{64}$")
  }
}
