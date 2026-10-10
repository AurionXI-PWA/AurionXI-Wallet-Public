package com.aurionxi.wallet.mainnet

import android.util.Log
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.appcompat.app.AlertDialog
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import java.math.BigInteger
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.UUID
import javax.crypto.Cipher

/** Biometric-to-signature boundary. Secrets and authorization stay native. */
internal class MainnetNativeSigningController(
  private val vault: MainnetNativeVaultMigration,
  private val registry: MainnetNativeAuthorizationRegistry,
  private val coordinator: MainnetNativeSigningCoordinator,
  private val payloadStore: MainnetNativeSignedPayloadStore,
  private val lifecycleGuard: MainnetNativeLifecycleGuard,
  private val handleIssuer: MainnetNativeHandleIssuer = MainnetNativeHandleIssuer(payloadStore),
  private val operationGate: MainnetNativeTransferOperationGate,
  private val supportDiagnostics: MainnetNativeSupportDiagnostics? = null,
) {
  private class Operation(val id: String, val generation: Long, val activity: FragmentActivity, val promise: Promise, val review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer, val authorizationEpoch: Long, lifecycleGuard: MainnetNativeLifecycleGuard,
    val lease: MainnetNativeTransferOperationGate.Lease,
    val submitSigned: ((String, String, Long, MainnetNativeTransferOperationGate.Lease, Promise) -> Unit)?) {
    val startedAt = android.os.SystemClock.elapsedRealtime()
    val cancelled = AtomicBoolean(false); val settled = AtomicBoolean(false)
    val workerStarted = AtomicBoolean(false)
    @Volatile var custodyTransferred = false
    val boundaryGuard = MainnetNativeSigningBoundaryGuard(generation, review.observedAtMillis + REVIEW_TTL_MILLIS, lifecycleGuard, cancelled::get)
    @Volatile var prompt: BiometricPrompt? = null
    @Volatile var dialog: AlertDialog? = null
    @Volatile var biometricActive = false
  }
  private val stateLock = Any(); private val worker = Executors.newSingleThreadExecutor(); private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile private var active: Operation? = null

  fun begin(activity: FragmentActivity?, input: ReadableMap, authorizationEpoch: Double, promise: Promise,
    submitSigned: ((String, String, Long, MainnetNativeTransferOperationGate.Lease, Promise) -> Unit)? = null) {
    val review = try { parseReview(input) } catch (_: Exception) {
      promise.reject("mainnet_native_signing_invalid_review", "The reviewed Mainnet transfer is invalid."); return
    }
    supportDiagnostics?.event(MainnetNativeSupportDiagnostics.Trace(review.senderAddress, review.nonce.longValueExact(), review.replacesTransactionHash, review.swapOperation?.kind ?: review.replacementKind ?: "send"), "signing_request", "started")
    try { MainnetNativeSigningReleaseGate.requireReleased(review) } catch (_: SecurityException) {
      promise.reject("mainnet_native_signing_not_released", "Native Mainnet signing is not released for this exact transfer."); return
    }
    if (activity == null || !authorizationEpoch.isFinite() || authorizationEpoch < 0 || authorizationEpoch > MAX_SAFE_INTEGER || authorizationEpoch % 1.0 != 0.0) {
      promise.reject("mainnet_native_signing_unavailable", "Native Mainnet signing is unavailable."); return
    }
    activity.runOnUiThread {
      val operation = synchronized(stateLock) {
        if (active != null || activity.isFinishing || activity.isDestroyed) null
        else operationGate.acquire()?.let { lease ->
          payloadStore.invalidateAll()
          Operation(UUID.randomUUID().toString(), lifecycleGuard.capture(), activity, promise, review, authorizationEpoch.toLong(), lifecycleGuard, lease, submitSigned).also { active = it }
        }
      }
      if (operation == null) promise.reject("mainnet_native_operation_busy", "Native signing is unavailable or another native operation is completing.")
      else try { presentTrustedReview(operation) } catch (_: Exception) { settleFailure(operation, "mainnet_native_signing_unavailable", "Trusted native review is unavailable.") }
    }
  }

  fun cancelForLifecycle() {
    val operation = synchronized(stateLock) { active } ?: return
    operation.cancelled.set(true); registry.invalidateAll()
    operation.activity.runOnUiThread { operation.dialog?.dismiss(); operation.prompt?.cancelAuthentication() }
    settleFailure(operation, "mainnet_native_signing_cancelled", "Native Mainnet signing was not approved.")
  }
  /** Includes both the exact-detail review and the biometric surface. */
  fun isTrustedUiActive(): Boolean = synchronized(stateLock) {
    active?.let { !it.settled.get() && (it.dialog != null || it.biometricActive) } == true
  }
  fun shutdown() { cancelForLifecycle(); worker.shutdown() }

  private fun presentTrustedReview(operation: Operation) {
    val review = operation.review
    val asset = review.asset.symbol
    val contract = review.assetContract?.let { "\nToken contract: $it" }.orEmpty()
    val cancellation = review.replacesTransactionHash?.let { "${if (review.replacementKind == "cancel") "Cancel" else "Retry / Speed up"} previous transaction:\n$it\nNonce: ${review.nonce}\n${if (review.replacementKind == "cancel") "This sends 0 BNB to this same wallet. Only a network fee is spent." else "This keeps the original recipient and exact amount, using the original nonce and a higher network fee."} The original can still win until a receipt confirms which transaction used this nonce.\n\n" }.orEmpty()
    val message = if (review.swapOperation != null) {
      val op = requireNotNull(review.swapOperation)
      val input = review.asset.symbol; val output = if(op.outputAsset == "native-bnb") "BNB" else op.outputAsset.uppercase()
      "${if(op.kind == "swap") "Swap" else if(op.kind == "reset") "Reset spending permission" else "Approve spending permission"}\nWallet: ${review.senderAddress}\n${if(op.kind == "swap") "Pay: ${format18(java.math.BigInteger(op.intentAmountWei))} $input\nEstimated received: ${format18(java.math.BigInteger(op.estimatedOutWei))} $output\nMinimum received: ${format18(java.math.BigInteger(op.minimumOutWei))} $output" else "Spender: ${MainnetNativeSwapPolicy.ROUTER}\nAllowance: ${format18(review.amountWei)} $input"}\nAurionXI Wallet fee: 0%\nMaximum network fee: ${format18(review.gasLimit.multiply(review.gasPriceWei))} BNB"
    } else cancellation + "Network: BSC Mainnet (chain 56)\nSender: ${review.senderAddress}\nRecipient: ${review.recipientAddress}\nAsset: $asset$contract\nExact amount: ${format18(review.amountWei)} $asset\nAurionXI Wallet transfer fee: 0\nMaximum network fee: ${format18(review.gasLimit.multiply(review.gasPriceWei))} BNB\n\n" +
      (if (review.replacementKind == "cancel") "Approving biometrics submits this cancellation once. Its network fee is spent only if mined." else if (operation.submitSigned != null) "Approving biometrics signs and sends this exact transfer once. Real funds will move. Cancellation or an expired review never authorizes a different transfer." else "Approving biometrics signs this exact transfer only. Broadcasting requires a separate approval.")
    val dialog = AlertDialog.Builder(operation.activity)
      .setTitle(if (review.swapOperation != null) "Confirm ${review.swapOperation.kind}" else if (review.replacementKind == "cancel") "Cancel previous Mainnet transfer?" else if (review.replacementKind == "speed-up") "Retry / Speed up previous transfer?" else if (operation.submitSigned != null) "Send this Mainnet transfer?" else "Confirm exact Mainnet transaction")
      .setMessage(message)
      .setCancelable(false)
      .setNegativeButton("Cancel") { _, _ -> settleFailure(operation, "mainnet_native_signing_cancelled", "Native Mainnet signing was not approved.") }
      .setPositiveButton("Continue to biometrics") { _, _ ->
        if (isFresh(operation)) presentBiometric(operation) else settleExpired(operation)
      }
      .create()
    operation.dialog = dialog
    dialog.setOnShowListener { dialog.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    dialog.show()
    mainHandler.postDelayed({ if (isCurrent(operation)) settleExpired(operation) }, millisUntilExpiry(operation))
  }

  private fun presentBiometric(operation: Operation) {
    if (!isCurrent(operation) || !isFresh(operation)) { settleExpired(operation); return }
    val cipher = try { vault.prepareAuthenticatedVerificationCipher() } catch (_: Exception) {
      settleFailure(operation, "mainnet_native_signing_vault_unavailable", "The native Mainnet vault is unavailable."); return
    }
    val callback = object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        val authenticatedCipher = result.cryptoObject?.cipher
        operation.biometricActive = false
        if (!isCurrent(operation) || !isFresh(operation) || authenticatedCipher == null) { settleExpired(operation); return }
        operation.workerStarted.set(true)
        try { worker.execute { sign(operation, authenticatedCipher) } }
        catch (_: Exception) { operation.workerStarted.set(false); settleFailure(operation, "mainnet_native_signing_unavailable", "Native signing worker is unavailable.") }
      }
      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { operation.biometricActive = false; settleFailure(operation, "mainnet_native_signing_cancelled", "Native Mainnet signing was not approved.") }
      override fun onAuthenticationFailed() = Unit
    }
    try {
      operation.prompt = BiometricPrompt(operation.activity, ContextCompat.getMainExecutor(operation.activity), callback)
      operation.biometricActive = true
      operation.prompt?.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(if (operation.submitSigned != null) "Authorize this Mainnet transfer" else "Sign displayed Mainnet transaction").setSubtitle("Biometrics authorizes only the exact details shown by Android.").setNegativeButtonText("Cancel").build(), BiometricPrompt.CryptoObject(cipher))
    } catch (_: Exception) { settleFailure(operation, "mainnet_native_signing_unavailable", "Native biometric authorization is unavailable.") }
  }

  private fun sign(operation: Operation, authenticatedCipher: Cipher) {
    try {
      require(isCurrent(operation) && isFresh(operation))
      val digest = MainnetNativeReviewDigest.forTransfer(operation.review); val issuedAt = System.currentTimeMillis()
      require(isFresh(operation, issuedAt))
      val authorizationId = registry.issue(operation.review.senderAddress, digest, operation.authorizationEpoch, issuedAt + AUTHORIZATION_TTL_MILLIS, issuedAt)
      require(isCurrent(operation) && isFresh(operation))
      val signed = coordinator.signAfterNativeAuthorization(MainnetNativeSigningCoordinator.Request(operation.review, authorizationId, operation.authorizationEpoch, operation.boundaryGuard), authenticatedCipher)
      val handle = handleIssuer.issue(MainnetNativeSignedPayloadStore.Entry(signed.rawTransaction, signed.rawTransactionHash, operation.review, digest, authorizationId,
        minOf(System.currentTimeMillis() + AUTHORIZATION_TTL_MILLIS, operation.boundaryGuard.reviewExpiresAtMillis), operation.submitSigned != null), operation.boundaryGuard) { isCurrent(operation) }
      try {
        operation.boundaryGuard.requireActive()
        require(isCurrent(operation))
        if (!operation.settled.compareAndSet(false, true)) {
          payloadStore.invalidate(handle)
          return
        }
        clear(operation)
        val submitSigned = operation.submitSigned
        if (submitSigned != null) {
          operation.custodyTransferred = true
          try { submitSigned(handle, signed.rawTransactionHash, operation.generation, operation.lease, operation.promise) }
          catch (_: Exception) {
            operation.custodyTransferred = false; payloadStore.invalidate(handle)
            operation.promise.resolve(Arguments.createMap().apply {
              putString("state", "not-submitted"); putString("transactionHash", signed.rawTransactionHash); putString("errorCode", "mainnet_native_broadcast_unavailable")
            })
          }
        } else {
          operation.promise.resolve(Arguments.createMap().apply { putBoolean("signed", true); putString("broadcastHandle", handle); putString("transactionHash", signed.rawTransactionHash); putString("senderAddress", operation.review.senderAddress.lowercase()) })
        }
      } catch (error: Exception) {
        payloadStore.invalidate(handle)
        throw error
      }
    } catch (error: Exception) {
      val stage = failureStage(error)
      Log.i(TAG, "Native Mainnet signing failed at $stage: ${error.javaClass.simpleName}"); registry.invalidateAll()
      val diagnostics = (error as? MainnetNonceRecoveryRequiredException)?.diagnostics
      if (diagnostics != null) Log.i(TAG, "Native Mainnet recovery: $diagnostics")
      settleFailure(operation, "mainnet_native_signing_$stage", "Native Mainnet signing failed closed at $stage." + (diagnostics?.let { "\n$it" } ?: ""))
    } finally {
      operation.workerStarted.set(false)
      if (!operation.custodyTransferred) operationGate.release(operation.lease)
    }
  }

  private fun parseReview(input: ReadableMap): MainnetNativeIntentSemanticVerifier.ReviewedTransfer {
    require(input.getInt("chainId") == 56)
    val sender = address(input, "senderAddress"); val recipient = address(input, "recipient")
    val asset = when (input.getString("assetId")) { "native-bnb" -> MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB; "arxi" -> MainnetNativeIntentSemanticVerifier.Asset.ARXI; "usdt" -> MainnetNativeIntentSemanticVerifier.Asset.USDT; else -> throw IllegalArgumentException() }
    val contract = if (!input.hasKey("assetContract") || input.isNull("assetContract")) null else address(input, "assetContract")
    if (asset == MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB) require(contract == null) else require(contract.equals(MainnetNativeIntentSemanticVerifier.tokenContract(asset), true))
    val observedAt = nonNegative(input, "observedAt").longValueExact(); val now = System.currentTimeMillis()
    require(observedAt <= now + MAX_FUTURE_SKEW_MILLIS && now < observedAt + REVIEW_TTL_MILLIS)
    val cancelsHash = if (!input.hasKey("replacesTransactionHash") || input.isNull("replacesTransactionHash")) null else requireNotNull(input.getString("replacesTransactionHash")).lowercase()
    val swap = if (input.hasKey("swapOperation") && !input.isNull("swapOperation")) MainnetNativeSwapPolicy.parse(org.json.JSONObject(requireNotNull(input.getMap("swapOperation")).toHashMap())) else null
    val amount = if (cancelsHash == null && swap == null) positive(input, "amount") else nonNegative(input, "amount")
    val kind = if (!input.hasKey("replacementKind") || input.isNull("replacementKind")) null else input.getString("replacementKind")
    require((cancelsHash == null) == (kind == null))
    val review = MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56, sender, recipient, asset, contract, amount, nonNegative(input, "nonce"), positive(input, "gas"), positive(input, "gasPrice"), observedAt, cancelsHash, kind, swap)
    if (swap != null) require(MainnetNativeSwapPolicy.validReview(review))
    if (cancelsHash != null) require(MainnetNativeReplacementPolicy.validReview(review))
    return review
  }
  private fun address(input: ReadableMap, key: String) = (input.getString(key) ?: throw IllegalArgumentException()).lowercase().also { require(it.matches(ADDRESS)) }
  private fun positive(input: ReadableMap, key: String) = nonNegative(input, key).also { require(it > BigInteger.ZERO) }
  private fun nonNegative(input: ReadableMap, key: String): BigInteger { val value = input.getString(key) ?: throw IllegalArgumentException(); require(value.matches(DECIMAL) && value.length <= 78); return BigInteger(value) }
  private fun format18(value: BigInteger): String { val text = value.toString().padStart(19, '0'); return "${text.dropLast(18)}.${text.takeLast(18).trimEnd('0').ifEmpty { "0" }}" }
  private fun isFresh(operation: Operation, now: Long = System.currentTimeMillis()) = now < operation.review.observedAtMillis + REVIEW_TTL_MILLIS && operation.review.observedAtMillis <= now + MAX_FUTURE_SKEW_MILLIS && operation.boundaryGuard.isActive()
  private fun millisUntilExpiry(operation: Operation) = (operation.review.observedAtMillis + REVIEW_TTL_MILLIS - System.currentTimeMillis()).coerceAtLeast(0L)
  private fun settleExpired(operation: Operation) {
    operation.cancelled.set(true)
    operation.activity.runOnUiThread { operation.dialog?.dismiss(); operation.prompt?.cancelAuthentication() }
    settleFailure(operation, "mainnet_native_signing_expired", "The native Mainnet review expired; review the transfer again.")
  }
  private fun isCurrent(operation: Operation) = synchronized(stateLock) { active?.id == operation.id && active === operation && lifecycleGuard.isCurrent(operation.generation) && !operation.cancelled.get() && !operation.activity.isFinishing && !operation.activity.isDestroyed }
  private fun settleFailure(operation: Operation, code: String, message: String) { if (operation.settled.compareAndSet(false, true)) {
    supportDiagnostics?.event(MainnetNativeSupportDiagnostics.Trace(operation.review.senderAddress, operation.review.nonce.longValueExact(), operation.review.replacesTransactionHash, operation.review.swapOperation?.kind ?: operation.review.replacementKind ?: "send", operation.id, operation.startedAt),
      "signing", "stopped", mapOf("errorCode" to code, "lifecycleCurrent" to lifecycleGuard.isCurrent(operation.generation).toString()))
    clear(operation); if (!operation.workerStarted.get()) operationGate.release(operation.lease); operation.promise.reject(code, message) } }
  private fun clear(operation: Operation) {
    val dialog = operation.dialog
    val prompt = operation.prompt
    operation.biometricActive = false
    operation.dialog = null
    operation.prompt = null
    synchronized(stateLock) { if (active === operation) active = null }
    operation.activity.runOnUiThread {
      if (dialog?.isShowing == true) dialog.dismiss()
      prompt?.cancelAuthentication()
    }
  }
  private fun failureStage(error: Exception): String = when (error.message) {
    "Mainnet nonce recovery is required." -> "nonce_recovery"
    "Mainnet submitted nonce recovery is required." -> "submitted_nonce_recovery"
    "Mainnet pre-sign validation failed." -> "pre_sign_validation"
    "Mainnet nonce is unavailable." -> "nonce_reservation"
    "Native signer address mismatch." -> "vault_address"
    "Mainnet signing boundary journal failed." -> "signing_boundary"
    "Mainnet signature journal failed." -> "signed_unverified_journal"
    "Signed Mainnet transaction verification failed." -> "signed_transaction_verification"
    "Signed Mainnet transaction hash verification failed." -> "signed_hash_verification"
    "Mainnet signing journal failed." -> "signed_journal"
    "Native Mainnet signing operation expired or was cancelled." -> "lifecycle"
    else -> "failed"
  }
  private companion object { const val TAG = "AurionXIMainnetSigner"; const val AUTHORIZATION_TTL_MILLIS = 30_000L; const val REVIEW_TTL_MILLIS = 90_000L; const val MAX_FUTURE_SKEW_MILLIS = 5_000L; const val MAX_SAFE_INTEGER = 9_007_199_254_740_991.0; val ADDRESS = Regex("^0x[a-f0-9]{40}$"); val DECIMAL = Regex("^(0|[1-9][0-9]*)$") }
}
