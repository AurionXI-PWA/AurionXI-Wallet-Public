package com.aurionxi.wallet.mainnet

import android.app.AlertDialog
import android.text.InputType
import android.util.Log
import android.widget.EditText
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Owns the complete native migration lifetime. A request is valid only while
 * its exact foreground activity and operation generation remain current.
 */
internal class MainnetNativeMigrationController(
  private val migration: MainnetNativeVaultMigration,
) {
  private class Operation(val activity: FragmentActivity, val promise: Promise) {
    val cancelled = AtomicBoolean(false)
    val settled = AtomicBoolean(false)
    val workerStarted = AtomicBoolean(false)
    @Volatile var biometricPrompt: BiometricPrompt? = null
    @Volatile var pinDialog: AlertDialog? = null
  }

  private val stateLock = Any()
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "aurionxi-mainnet-migration").apply { isDaemon = true }
  }
  @Volatile private var active: Operation? = null

  fun begin(activity: FragmentActivity?, promise: Promise) {
    Log.i(TAG, "stage=migration_request_received")
    if (activity == null) {
      rejectUnavailable(promise, "hasActivity=false")
      return
    }
    activity.runOnUiThread {
      val operation = synchronized(stateLock) {
        if (active != null || activity.isFinishing || activity.isDestroyed) null
        else Operation(activity, promise).also { active = it }
      }
      if (operation == null) {
        rejectUnavailable(promise, "hasActivity=true finishing=${activity.isFinishing} destroyed=${activity.isDestroyed} active=${active != null}")
        return@runOnUiThread
      }
      startBiometric(operation)
    }
  }

  fun cancelForLifecycle() {
    val operation = synchronized(stateLock) { active } ?: return
    operation.cancelled.set(true)
    operation.activity.runOnUiThread {
      operation.biometricPrompt?.cancelAuthentication()
      operation.pinDialog?.dismiss()
    }
    // A running worker holds the operation until it reaches a cancellation
    // checkpoint; allowing another request before then would create a race.
    if (!operation.workerStarted.get()) finishCancelled(operation, "lifecycle_cancelled")
  }

  /** True only while Android owns the visible biometric or PIN surface. */
  fun isTrustedUiActive(): Boolean = synchronized(stateLock) {
    active?.let { !it.settled.get() && (it.biometricPrompt != null || it.pinDialog != null) } == true
  }

  private fun startBiometric(operation: Operation) {
    if (!isCurrent(operation)) {
      finishCancelled(operation, "stale_before_biometric")
      return
    }
    val cipher = try {
      migration.prepareAuthenticatedStorageCipher()
    } catch (error: Exception) {
      Log.e(TAG, "stage=prepare_authenticated_cipher_failed type=${error.javaClass.simpleName}")
      finishFailure(operation, "mainnet_native_migration_failed")
      return
    }
    val callback = object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        val authenticatedCipher = result.cryptoObject?.cipher
        if (!isCurrent(operation) || authenticatedCipher == null) {
          if (authenticatedCipher == null) Log.e(TAG, "stage=authenticated_cipher_missing")
          finishCancelled(operation, "stale_after_biometric")
          return
        }
        showPinDialog(operation, authenticatedCipher)
      }

      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        Log.i(TAG, "stage=biometric_not_approved code=$errorCode")
        finishCancelled(operation, "biometric_not_approved")
      }

      override fun onAuthenticationFailed() = Unit
    }
    operation.biometricPrompt = BiometricPrompt(operation.activity, ContextCompat.getMainExecutor(operation.activity), callback)
    Log.i(TAG, "stage=migration_biometric_presented")
    operation.biometricPrompt?.authenticate(
      BiometricPrompt.PromptInfo.Builder()
        .setTitle("Verify Mainnet vault migration")
        .setSubtitle("Approve the Android biometric prompt to protect the native vault.")
        .setNegativeButtonText("Cancel")
        .build(),
      BiometricPrompt.CryptoObject(cipher),
    )
  }

  private fun showPinDialog(operation: Operation, cipher: javax.crypto.Cipher) {
    if (!isCurrent(operation)) {
      finishCancelled(operation, "stale_before_pin")
      return
    }
    val input = EditText(operation.activity).apply {
      inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
      setHint("Mainnet PIN")
      setSingleLine(true)
    }
    val dialog = AlertDialog.Builder(operation.activity)
      .setTitle("Confirm Mainnet PIN")
      .setMessage("Your PIN is checked only inside Android and is never sent to the React Native bridge.")
      .setView(input)
      .setNegativeButton("Cancel", null)
      .setPositiveButton("Verify", null)
      .create()
    operation.pinDialog = dialog
    dialog.setOnCancelListener { finishCancelled(operation, "pin_dialog_cancelled") }
    dialog.setOnShowListener {
      dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener { finishCancelled(operation, "pin_dialog_cancelled") }
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
        if (!isCurrent(operation)) {
          finishCancelled(operation, "stale_before_pin_submit")
          return@setOnClickListener
        }
        val editable = input.text
        if (editable == null || editable.length != 6 || editable.any { it !in '0'..'9' }) {
          input.error = "Enter your six-digit Mainnet PIN"
          return@setOnClickListener
        }
        val pin = CharArray(editable.length) { index -> editable[index] }
        editable.clear()
        operation.workerStarted.set(true)
        dialog.dismiss()
        worker.execute {
          var address: String? = null
          var failureCode: String? = null
          try {
            address = migration.migrateStoredExpoV3(pin, cipher) { requireCurrent(operation) }
            requireCurrent(operation)
          } catch (failure: MainnetNativeVaultMigration.MigrationFailure) {
            Log.e(TAG, "stage=${failure.stage}")
            failureCode = "mainnet_native_migration_${failure.stage}"
          } catch (error: Exception) {
            Log.e(TAG, "stage=unexpected_native_migration_failure type=${error.javaClass.simpleName}")
            failureCode = "mainnet_native_migration_failed"
          } finally {
            pin.fill('\u0000')
            operation.workerStarted.set(false)
            val completedAddress = address
            if (completedAddress != null && operation.settled.compareAndSet(false, true)) {
              clearActive(operation)
              operation.promise.resolve(Arguments.createMap().apply {
                putBoolean("migrated", true)
                putString("address", completedAddress)
              })
            } else if (failureCode != null) {
              finishFailure(operation, failureCode!!)
            }
          }
        }
      }
    }
    Log.i(TAG, "stage=migration_pin_presented")
    dialog.show()
  }

  private fun requireCurrent(operation: Operation) {
    if (!isCurrent(operation)) throw MainnetNativeVaultMigration.MigrationFailure("migration_cancelled_or_stale")
  }

  private fun isCurrent(operation: Operation): Boolean = synchronized(stateLock) {
    active === operation && !operation.cancelled.get() && !operation.activity.isFinishing && !operation.activity.isDestroyed
  }

  private fun finishCancelled(operation: Operation, stage: String) {
    if (!operation.settled.compareAndSet(false, true)) return
    Log.i(TAG, "stage=$stage")
    clearActive(operation)
    operation.promise.reject("mainnet_native_migration_cancelled", "Native Mainnet migration was not approved.")
  }

  private fun finishFailure(operation: Operation, code: String) {
    if (!operation.settled.compareAndSet(false, true)) return
    clearActive(operation)
    operation.promise.reject(code, "Mainnet vault migration could not be verified.")
  }

  private fun clearActive(operation: Operation) {
    val prompt = operation.biometricPrompt
    val dialog = operation.pinDialog
    operation.biometricPrompt = null
    operation.pinDialog = null
    synchronized(stateLock) { if (active === operation) active = null }
    operation.activity.runOnUiThread {
      if (dialog?.isShowing == true) dialog.dismiss()
      prompt?.cancelAuthentication()
    }
  }

  private fun rejectUnavailable(promise: Promise, detail: String) {
    Log.i(TAG, "stage=native_migration_unavailable $detail")
    promise.reject("mainnet_native_migration_unavailable", "Native Mainnet migration is unavailable.")
  }

  private companion object { const val TAG = "AurionXIMainnetMigration" }
}
