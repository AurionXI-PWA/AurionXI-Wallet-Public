package com.aurionxi.wallet.mainnet

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.lambdapioneer.argon2kt.Argon2Kt
import com.lambdapioneer.argon2kt.Argon2Mode
import org.json.JSONObject
import org.web3j.crypto.Bip32ECKeyPair
import org.web3j.crypto.Credentials
import org.web3j.crypto.MnemonicUtils
import java.nio.CharBuffer
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** One-time bridge from the legacy V3 envelope to Android-Keystore storage. */
internal class MainnetNativeVaultMigration(private val context: Context) {
  /**
   * Safe error labels for on-device diagnosis.  They deliberately contain no
   * PIN, recovery data, encrypted envelope, address, or keystore material.
   */
  internal class MigrationFailure(val stage: String) : SecurityException(stage)

  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val lock = Any()
  fun prepareAuthenticatedStorageCipher(): Cipher {
    val key = biometricStorageKey()
    return Cipher.getInstance("AES/GCM/NoPadding").also { it.init(Cipher.ENCRYPT_MODE, key) }
  }

  /** Prepares a decrypt Cipher that Android must authorize through biometrics. */
  fun prepareAuthenticatedVerificationCipher(): Cipher {
    val address = readAddress() ?: throw MigrationFailure("native_vault_not_found")
    val sealed = preferences.getString(BIOMETRIC_RECORD_KEY, null) ?: throw MigrationFailure("native_vault_not_found")
    val bytes = try { Base64.decode(sealed, Base64.NO_WRAP) } catch (_: Exception) { throw MigrationFailure("native_vault_corrupt") }
    if (bytes.size <= 28) throw MigrationFailure("native_vault_corrupt")
    return Cipher.getInstance("AES/GCM/NoPadding").also { cipher ->
      cipher.init(Cipher.DECRYPT_MODE, biometricStorageKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    }
  }

  /** Fresh-biometric verification returns only the public address, never vault entropy. */
  fun verifyAuthenticatedNativeVault(authenticatedCipher: Cipher): String = synchronized(lock) {
    val address = readAddress() ?: throw MigrationFailure("native_vault_not_found")
    val sealed = preferences.getString(BIOMETRIC_RECORD_KEY, null) ?: throw MigrationFailure("native_vault_not_found")
    var entropy: ByteArray? = null
    try {
      val bytes = Base64.decode(sealed, Base64.NO_WRAP)
      if (bytes.size <= 28) throw MigrationFailure("native_vault_corrupt")
      authenticatedCipher.updateAAD(address.toByteArray(StandardCharsets.UTF_8))
      entropy = authenticatedCipher.doFinal(bytes.copyOfRange(12, bytes.size))
      if (deriveAddress(entropy) != address) throw MigrationFailure("native_vault_address_mismatch")
      return address
    } catch (failure: MigrationFailure) {
      throw failure
    } catch (_: Exception) {
      throw MigrationFailure("native_vault_verification_failed")
    } finally {
      entropy?.fill(0)
    }
  }
  /**
   * Creates the native record but deliberately retains the legacy record.
   * Retirement is a later, separately authorised operation after fresh native
   * biometric decryption has been implemented and verified.
   */
  fun migrateStoredExpoV3(pin: CharArray, authenticatedCipher: Cipher, requireCurrentOperation: () -> Unit): String {
    requireCurrentOperation()
    val stored = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
      .getString("com.aurionxi.wallet.bsc-mainnet.v1.vault-aurionxi.wallet.bsc-mainnet.v1.vault", null)
      ?: throw MigrationFailure("legacy_vault_not_found")
    if (!isSixDigitPin(pin)) throw MigrationFailure("native_pin_invalid")
    val envelopeJson = try {
      val item = JSONObject(stored)
      if (item.getString("scheme") != "aes" || item.optBoolean("requireAuthentication", false)) {
        throw MigrationFailure("legacy_vault_unsupported")
      }
      val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val sourceKey = store.getKey("AES/GCM/NoPadding:com.aurionxi.wallet.bsc-mainnet.v1.vault:keystoreUnauthenticated", null) as? SecretKey
        ?: throw MigrationFailure("legacy_keystore_key_not_found")
      val sourceCipher = Cipher.getInstance("AES/GCM/NoPadding")
      sourceCipher.init(Cipher.DECRYPT_MODE, sourceKey, GCMParameterSpec(item.getInt("tlen"), Base64.decode(item.getString("iv"), Base64.DEFAULT)))
      String(sourceCipher.doFinal(Base64.decode(item.getString("ct"), Base64.DEFAULT)), StandardCharsets.UTF_8)
    } catch (failure: MigrationFailure) {
      throw failure
    } catch (_: Exception) {
      throw MigrationFailure("legacy_vault_unreadable")
    }
    return try {
      requireCurrentOperation()
      migrateNativeEnvelope(envelopeJson, pin, authenticatedCipher, requireCurrentOperation)
    } catch (failure: MigrationFailure) {
      throw failure
    } catch (_: Exception) {
      throw MigrationFailure("native_vault_write_or_pin_verification_failed")
    }
  }
  private fun migrateNativeEnvelope(envelopeJson: String, pin: CharArray, authenticatedCipher: Cipher, requireCurrentOperation: () -> Unit): String = synchronized(lock) {
    requireCurrentOperation()
    require(isSixDigitPin(pin)) { "Mainnet migration failed." }
    val envelope = JSONObject(envelopeJson); val createdAt = envelope.getString("createdAt"); val address = envelope.getString("publicAddress").lowercase(); val pinObject = envelope.getJSONObject("pin")
    val pinBytes = utf8(pin); val saltBytes = hexToBytes(pinObject.getString("saltHex")); var wrappingKey: ByteArray? = null; var vaultKey: ByteArray? = null; var payload: ByteArray? = null; var entropy: ByteArray? = null
    try {
      require(envelope.getString("format") == "aurionxi-vault-v3" && address.matches(ADDRESS) && createdAt.matches(TIMESTAMP) && pinObject.getString("algorithm") == "argon2id") { "Mainnet migration failed." }
      wrappingKey = hexToBytes(Argon2Kt().hash(Argon2Mode.ARGON2_ID, pinBytes, saltBytes, 2, 19_456, 1, 32).rawHashAsHexadecimal(false)); vaultKey = open(pinObject.getString("wrappedVaultKey"), wrappingKey, aad(createdAt, address, "pin-wrap")); payload = open(envelope.getString("payloadCiphertext"), vaultKey, aad(createdAt, address, "payload")); entropy = decodeEntropy(payload); require(deriveAddress(entropy) == address) { "Mainnet migration address mismatch." }
      val existingAddress = readAddress()
      if (hasNativeVault()) {
        if (existingAddress == address) return address
        throw MigrationFailure("native_vault_address_conflict")
      }
      if (existingAddress != null) throw MigrationFailure("native_vault_state_corrupt")
      requireCurrentOperation()
      authenticatedCipher.updateAAD(address.toByteArray(StandardCharsets.UTF_8)); val sealed = Base64.encodeToString(authenticatedCipher.iv + authenticatedCipher.doFinal(entropy), Base64.NO_WRAP)
      requireCurrentOperation()
      require(preferences.edit().putString(BIOMETRIC_RECORD_KEY, sealed).putString(ADDRESS_KEY, address).putString(MIGRATION_STATE_KEY, MIGRATION_STATE_NATIVE_WRITTEN_LEGACY_RETAINED).commit()) { "Mainnet migration storage failed." }; return address
    } finally { pinBytes.fill(0); saltBytes.fill(0); wrappingKey?.fill(0); vaultKey?.fill(0); payload?.fill(0); entropy?.fill(0) }
  }
  private fun migrateLegacyV3(envelopeJson: String, pin: String): String = synchronized(lock) {
    require(pin.matches(Regex("^\\d{6}$"))) { "Mainnet migration failed." }
    val envelope = JSONObject(envelopeJson); val createdAt = envelope.getString("createdAt"); val address = envelope.getString("publicAddress").lowercase(); val pinObject = envelope.getJSONObject("pin")
    require(envelope.getString("format") == "aurionxi-vault-v3" && address.matches(ADDRESS) && createdAt.matches(TIMESTAMP) && pinObject.getString("algorithm") == "argon2id") { "Mainnet migration failed." }
    val saltHex = pinObject.getString("saltHex").lowercase(); require(saltHex.matches(HEX_16)) { "Mainnet migration failed." }
    val pinBytes = pin.toByteArray(StandardCharsets.UTF_8); val saltBytes = hexToBytes(saltHex); var wrappingKey: ByteArray? = null; var vaultKey: ByteArray? = null; var payload: ByteArray? = null; var entropy: ByteArray? = null
    try {
      wrappingKey = hexToBytes(Argon2Kt().hash(Argon2Mode.ARGON2_ID, pinBytes, saltBytes, 2, 19_456, 1, 32).rawHashAsHexadecimal(false)); vaultKey = open(pinObject.getString("wrappedVaultKey"), wrappingKey, aad(createdAt, address, "pin-wrap")); require(vaultKey.size == 32) { "Mainnet migration failed." }
      payload = open(envelope.getString("payloadCiphertext"), vaultKey, aad(createdAt, address, "payload")); entropy = decodeEntropy(payload); require(deriveAddress(entropy) == address) { "Mainnet migration address mismatch." }
      if (preferences.contains(RECORD_KEY)) { require(readAddress() == address) { "A different native Mainnet vault already exists." }; return address }
      require(preferences.edit().putString(RECORD_KEY, seal(entropy, address)).putString(ADDRESS_KEY, address).commit()) { "Mainnet migration storage failed." }; return address
    } finally { pinBytes.fill(0); saltBytes.fill(0); wrappingKey?.fill(0); vaultKey?.fill(0); payload?.fill(0); entropy?.fill(0) }
  }
  fun hasNativeVault() = preferences.contains(BIOMETRIC_RECORD_KEY) && readAddress() != null
  fun readAddress(): String? = preferences.getString(ADDRESS_KEY, null)?.lowercase()?.takeIf { it.matches(ADDRESS) }
  /** Opens native entropy only with the one-shot Cipher approved by BiometricPrompt. */
  fun <T> withDerivedCredentials(authenticatedCipher: Cipher, requireActive: () -> Unit, action: (Credentials) -> T): T = synchronized(lock) {
    requireActive()
    val address = readAddress() ?: throw SecurityException("No native Mainnet vault is available.")
    val sealed = preferences.getString(BIOMETRIC_RECORD_KEY, null) ?: throw SecurityException("No biometric-authorized native Mainnet vault is available.")
    var entropy: ByteArray? = null; var seed: ByteArray? = null
    try {
      val bytes = try { Base64.decode(sealed, Base64.NO_WRAP) } catch (_: Exception) { throw SecurityException("Corrupt native Mainnet vault.") }
      require(bytes.size > 28) { "Corrupt native Mainnet vault." }
      requireActive()
      authenticatedCipher.updateAAD(address.toByteArray(StandardCharsets.UTF_8))
      entropy = authenticatedCipher.doFinal(bytes.copyOfRange(12, bytes.size))
      requireActive()
      require(deriveAddress(entropy) == address) { "Native Mainnet vault address mismatch." }
      val mnemonic = MnemonicUtils.generateMnemonic(entropy); seed = MnemonicUtils.generateSeed(mnemonic, null)
      val master = Bip32ECKeyPair.generateKeyPair(seed); val child = Bip32ECKeyPair.deriveKeyPair(master, intArrayOf(44 or HARDENED, 60 or HARDENED, HARDENED, 0, 0))
      val credentials = Credentials.create(child); require(credentials.address.equals(address, ignoreCase = true)) { "Native Mainnet vault credential mismatch." }
      requireActive()
      action(credentials)
    } finally { entropy?.fill(0); seed?.fill(0) }
  }
  private fun deriveAddress(entropy: ByteArray): String { val mnemonic = MnemonicUtils.generateMnemonic(entropy); val seed = MnemonicUtils.generateSeed(mnemonic, null); try { val master = Bip32ECKeyPair.generateKeyPair(seed); val child = Bip32ECKeyPair.deriveKeyPair(master, intArrayOf(44 or HARDENED, 60 or HARDENED, HARDENED, 0, 0)); return Credentials.create(child).address.lowercase() } finally { seed.fill(0) } }
  private fun isSixDigitPin(value: CharArray) = value.size == 6 && value.all { it in '0'..'9' }
  private fun utf8(value: CharArray): ByteArray { val encoded = StandardCharsets.UTF_8.newEncoder().encode(CharBuffer.wrap(value)); return ByteArray(encoded.remaining()).also { encoded.get(it) } }
  private fun decodeEntropy(payload: ByteArray): ByteArray { require(payload.size >= 43 && payload[0] == 0x41.toByte() && payload[1] == 0x52.toByte() && payload[2] == 0x58.toByte() && payload[3] == 0x49.toByte() && payload[4] == 1.toByte() && payload[5] == 1.toByte()) { "Mainnet migration failed." }; val size = payload[6].toInt() and 0xff; require(size in setOf(16, 20, 24, 28, 32) && payload.size == 27 + size && uint32(payload, 7) == 44L && uint32(payload, 11) == 60L && uint32(payload, 15) == 0L && uint32(payload, 19) == 0L && uint32(payload, 23) == 0L) { "Mainnet migration failed." }; return payload.copyOfRange(27, payload.size) }
  private fun uint32(value: ByteArray, offset: Int): Long = ((value[offset].toLong() and 0xff) shl 24) or ((value[offset + 1].toLong() and 0xff) shl 16) or ((value[offset + 2].toLong() and 0xff) shl 8) or (value[offset + 3].toLong() and 0xff)
  private fun aad(createdAt: String, address: String, purpose: String) = "{\"createdAt\":\"$createdAt\",\"format\":\"aurionxi-vault-v3\",\"publicAddress\":\"${address.lowercase()}\",\"purpose\":\"$purpose\"}".toByteArray(StandardCharsets.UTF_8)
  private fun open(encoded: String, key: ByteArray, aad: ByteArray): ByteArray { val bytes = Base64.decode(encoded, Base64.NO_WRAP); require(bytes.size > 28) { "Mainnet migration failed." }; val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, javax.crypto.spec.SecretKeySpec(key, "AES"), GCMParameterSpec(128, bytes.copyOfRange(0, 12))); cipher.updateAAD(aad); return cipher.doFinal(bytes.copyOfRange(12, bytes.size)) }
  private fun seal(plaintext: ByteArray, address: String): String { val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, storageKey()); cipher.updateAAD(address.toByteArray(StandardCharsets.UTF_8)); return Base64.encodeToString(cipher.iv + cipher.doFinal(plaintext), Base64.NO_WRAP) }
  private fun storageKey(): SecretKey { val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }; (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }; return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build()) }.generateKey() }
  private fun biometricStorageKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(BIOMETRIC_KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(BIOMETRIC_KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).setUserAuthenticationRequired(true).setInvalidatedByBiometricEnrollment(true).build())
    }.generateKey()
  }
  private fun hexToBytes(value: String): ByteArray { require(value.matches(Regex("^[0-9a-fA-F]+$") ) && value.length % 2 == 0) { "Mainnet migration failed." }; return value.chunked(2).map { it.toInt(16).toByte() }.toByteArray() }
  private companion object { const val PREFERENCES = "aurionxi.mainnet.native-vault.v1"; const val RECORD_KEY = "entropy"; const val BIOMETRIC_RECORD_KEY = "entropy.biometric.v2"; const val ADDRESS_KEY = "address"; const val MIGRATION_STATE_KEY = "migration.state.v1"; const val MIGRATION_STATE_NATIVE_WRITTEN_LEGACY_RETAINED = "native-written-legacy-retained"; const val KEY_ALIAS = "aurionxi.mainnet.native-vault.key.v1"; const val BIOMETRIC_KEY_ALIAS = "aurionxi.mainnet.native-vault.key.biometric.v2"; const val HARDENED = 0x80000000.toInt(); val ADDRESS = Regex("^0x[a-fA-F0-9]{40}$"); val HEX_16 = Regex("^[0-9a-f]{32}$"); val TIMESTAMP = Regex("^[0-9T:.+\\-Z]+$") }
}
