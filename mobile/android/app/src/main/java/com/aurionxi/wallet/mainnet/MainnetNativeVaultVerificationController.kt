package com.aurionxi.wallet.mainnet

import android.util.Log
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Fresh-biometric proof that the v2 native vault can be opened. This is not a
 * signer: it exposes no entropy, credentials, authorization identifier, raw
 * transaction, or broadcast capability to React Native.
 */
internal class MainnetNativeVaultVerificationController(
  private val vault: MainnetNativeVaultMigration,
) {
  private class Operation(val activity: FragmentActivity, val promise: Promise) {
    val cancelled = AtomicBoolean(false)
    val settled = AtomicBoolean(false)
    @Volatile var prompt: BiometricPrompt? = null
  }

  private val stateLock = Any()
  @Volatile private var active: Operation? = null

  fun begin(activity: FragmentActivity?, promise: Promise) {
    if (activity == null) { promise.reject("mainnet_native_verification_unavailable", "Native Mainnet verification is unavailable."); return }
    activity.runOnUiThread {
      val operation = synchronized(stateLock) {
        if (active != null || activity.isFinishing || activity.isDestroyed) null
        else Operation(activity, promise).also { active = it }
      }
      if (operation == null) { promise.reject("mainnet_native_verification_unavailable", "Native Mainnet verification is unavailable."); return@runOnUiThread }
      present(operation)
    }
  }

  fun cancelForLifecycle() {
    val operation = synchronized(stateLock) { active } ?: return
    operation.cancelled.set(true)
    operation.activity.runOnUiThread { operation.prompt?.cancelAuthentication() }
    settleFailure(operation, "mainnet_native_verification_cancelled", "Native Mainnet verification was not approved.")
  }

  private fun present(operation: Operation) {
    val cipher = try { vault.prepareAuthenticatedVerificationCipher() } catch (failure: MainnetNativeVaultMigration.MigrationFailure) {
      settleFailure(operation, "mainnet_native_${failure.stage}", "Native Mainnet vault could not be verified."); return
    } catch (_: Exception) {
      settleFailure(operation, "mainnet_native_verification_failed", "Native Mainnet vault could not be verified."); return
    }
    val callback = object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        val authenticatedCipher = result.cryptoObject?.cipher
        if (!isCurrent(operation) || authenticatedCipher == null) { settleFailure(operation, "mainnet_native_verification_cancelled", "Native Mainnet verification was not approved."); return }
        try {
          val address = vault.verifyAuthenticatedNativeVault(authenticatedCipher)
          if (!isCurrent(operation)) { settleFailure(operation, "mainnet_native_verification_cancelled", "Native Mainnet verification was not approved."); return }
          if (operation.settled.compareAndSet(false, true)) {
            clear(operation)
            operation.promise.resolve(Arguments.createMap().apply { putBoolean("verified", true); putString("address", address) })
          }
        } catch (failure: MainnetNativeVaultMigration.MigrationFailure) {
          Log.i(TAG, "stage=${failure.stage}")
          settleFailure(operation, "mainnet_native_${failure.stage}", "Native Mainnet vault could not be verified.")
        } catch (_: Exception) {
          settleFailure(operation, "mainnet_native_verification_failed", "Native Mainnet vault could not be verified.")
        }
      }
      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = settleFailure(operation, "mainnet_native_verification_cancelled", "Native Mainnet verification was not approved.")
      override fun onAuthenticationFailed() = Unit
    }
    operation.prompt = BiometricPrompt(operation.activity, ContextCompat.getMainExecutor(operation.activity), callback)
    operation.prompt?.authenticate(
      BiometricPrompt.PromptInfo.Builder().setTitle("Verify native Mainnet vault").setSubtitle("Approve the Android biometric prompt. No signature will be created.").setNegativeButtonText("Cancel").build(),
      BiometricPrompt.CryptoObject(cipher),
    )
  }

  private fun isCurrent(operation: Operation) = synchronized(stateLock) { active === operation && !operation.cancelled.get() && !operation.activity.isFinishing && !operation.activity.isDestroyed }
  private fun settleFailure(operation: Operation, code: String, message: String) { if (operation.settled.compareAndSet(false, true)) { clear(operation); operation.promise.reject(code, message) } }
  private fun clear(operation: Operation) {
    val prompt = operation.prompt
    operation.prompt = null
    synchronized(stateLock) { if (active === operation) active = null }
    operation.activity.runOnUiThread { prompt?.cancelAuthentication() }
  }
  private companion object { const val TAG = "AurionXIMainnetVerification" }
}
