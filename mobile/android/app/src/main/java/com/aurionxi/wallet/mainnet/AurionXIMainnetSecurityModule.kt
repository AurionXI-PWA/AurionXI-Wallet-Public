package com.aurionxi.wallet.mainnet

import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.LifecycleEventListener
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Capability-only bridge for the native Mainnet security foundation.
 * No method accepts a mnemonic, private key, raw transaction, or RPC URL.
 * Native signing is exposed only as a release-gated biometric operation.
 * Broadcasting accepts only an opaque native-issued handle and a public hash.
 */
class AurionXIMainnetSecurityModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
  private val supportDiagnostics = MainnetNativeSupportDiagnostics(reactContext.applicationContext)
  private val lifecycleGuard = MainnetNativeLifecycleGuard()
  private val authorizationRegistry = MainnetNativeAuthorizationRegistry()
  private val nativeVaultMigration = MainnetNativeVaultMigration(reactContext.applicationContext)
  private val migrationController = MainnetNativeMigrationController(nativeVaultMigration)
  private val verificationController = MainnetNativeVaultVerificationController(nativeVaultMigration)
  private val nonceJournal = MainnetEncryptedNonceJournal(reactContext.applicationContext)
  private val signingCoordinator = MainnetNativeSigningCoordinator(authorizationRegistry, nativeVaultMigration, nonceJournal)
  private val signedPayloadStore = MainnetNativeSignedPayloadStore()
  private val transferOperationGate = MainnetNativeTransferOperationGate()
  private val signingController = MainnetNativeSigningController(nativeVaultMigration, authorizationRegistry, signingCoordinator, signedPayloadStore, lifecycleGuard, operationGate = transferOperationGate, supportDiagnostics = supportDiagnostics)
  private val broadcastController = MainnetNativeBroadcastController(reactContext.applicationContext, signedPayloadStore, nonceJournal, lifecycleGuard, transferOperationGate, supportDiagnostics)
  private val swapWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val moduleInvalidated = AtomicBoolean(false)
  private val processObserverRegistered = AtomicBoolean(false)
  private val processObserver = object : DefaultLifecycleObserver {
    override fun onStop(owner: LifecycleOwner) = invalidateNativeOperations()
  }

  override fun initialize() {
    super.initialize()
    reactApplicationContext.addLifecycleEventListener(this)
    // TurboModules may initialize on a React Native queue. LifecycleRegistry
    // requires observer mutations on Android's main thread.
    mainHandler.post {
      if (!moduleInvalidated.get() && processObserverRegistered.compareAndSet(false, true)) {
        ProcessLifecycleOwner.get().lifecycle.addObserver(processObserver)
      }
    }
  }

  override fun invalidate() {
    moduleInvalidated.set(true)
    lifecycleGuard.invalidate(); authorizationRegistry.invalidateAll()
    migrationController.cancelForLifecycle()
    verificationController.cancelForLifecycle()
    signingController.shutdown()
    broadcastController.shutdown()
    swapWorker.shutdown()
    mainHandler.post {
      if (processObserverRegistered.compareAndSet(true, false)) {
        ProcessLifecycleOwner.get().lifecycle.removeObserver(processObserver)
      }
    }
    reactApplicationContext.removeLifecycleEventListener(this)
    super.invalidate()
  }

  override fun onHostResume() = Unit
  override fun onHostPause() {
    val signingTrustedUi = signingController.isTrustedUiActive()
    val broadcastTrustedUi = broadcastController.isTrustedUiActive()
    if (!broadcastTrustedUi) {
      broadcastController.cancelForLifecycle()
    }
    // Android-owned dialogs and BiometricPrompt may transiently pause the host.
    // Keep only those exact trusted-UI operations alive; ProcessLifecycleOwner
    // still revokes everything when the application genuinely backgrounds.
    if (!migrationController.isTrustedUiActive()) {
      migrationController.cancelForLifecycle()
    }
    if (!signingTrustedUi && !broadcastTrustedUi) {
      authorizationRegistry.invalidateAll()
      lifecycleGuard.invalidate()
      signingController.cancelForLifecycle()
    }
  }
  override fun onHostDestroy() { invalidateNativeOperations(); verificationController.cancelForLifecycle() }
  override fun getName() = "AurionXIMainnetSecurity"

  override fun getConstants(): Map<String, Any> = mapOf(
    "available" to true,
    "signingReleased" to MainnetNativeSigningReleaseGate.isReleased(),
    "journalVersion" to 1,
    "swapReleased" to MainnetNativeSwapPolicy.isReleased(),
  )

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putBoolean("available", true)
      putBoolean("signingReleased", MainnetNativeSigningReleaseGate.isReleased())
      putInt("journalVersion", 1)
      putBoolean("swapReleased", MainnetNativeSwapPolicy.isReleased())
    })
  }

  /** Unlock UI readiness only. This grants no signing or vault authorization. */
  @ReactMethod
  fun isWalletAuthenticationHostReady(promise: Promise) {
    mainHandler.post {
      val activity = reactApplicationContext.currentActivity as? FragmentActivity
      promise.resolve(!moduleInvalidated.get() && activity != null &&
        !activity.isFinishing && !activity.isDestroyed &&
        activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) &&
        !activity.supportFragmentManager.isStateSaved && activity.hasWindowFocus())
    }
  }

  /** JS may request revocation but can never issue, inspect, or consume a native authorization. */
  @ReactMethod
  fun invalidateAuthorizations() {
    invalidateNativeOperations()
  }

  /** One-time native migration; JS supplies neither the V3 envelope nor PIN. */
  @ReactMethod
  fun beginNativeMainnetVaultMigration(promise: Promise) {
    migrationController.begin(reactApplicationContext.currentActivity as? FragmentActivity, promise)
  }

  /** Public-address-only proof of a fresh Android biometric vault opening. */
  @ReactMethod
  fun verifyNativeMainnetVault(promise: Promise) {
    verificationController.begin(reactApplicationContext.currentActivity as? FragmentActivity, promise)
  }

  /** Public reviewed fields in; signed bytes and public identifiers out. */
  @ReactMethod
  fun signNativeMainnetTransfer(review: ReadableMap, authorizationEpoch: Double, promise: Promise) {
    signingController.begin(reactApplicationContext.currentActivity as? FragmentActivity, review, authorizationEpoch, promise)
  }

  /** One trusted Send approval covers native biometric signing and one submission. */
  @ReactMethod
  fun sendNativeMainnetTransfer(review: ReadableMap, authorizationEpoch: Double, promise: Promise) {
    signingController.begin(reactApplicationContext.currentActivity as? FragmentActivity, review, authorizationEpoch, promise,
      submitSigned = { handle, hash, generation, lease, result ->
        broadcastController.beginAuthorized(reactApplicationContext.currentActivity as? FragmentActivity, handle, hash, generation, lease, result)
      })
  }

  @ReactMethod
  fun prepareNativeMainnetSwap(senderAddress: String, inputAsset: String, outputAsset: String, amountWei: String, promise: Promise) {
    val generation = lifecycleGuard.capture()
    val lease = transferOperationGate.acquire()
    if(lease == null) { promise.reject("mainnet_native_operation_busy", "Another operation is completing."); return }
    try { swapWorker.execute {
      try {
        require(lifecycleGuard.isCurrent(generation))
        val quote = MainnetNativeSwapSnapshotClient().read(senderAddress,inputAsset,outputAsset,amountWei)
        require(lifecycleGuard.isCurrent(generation))
        quote.put("executionEnabled",quote.optBoolean("executionEnabled") && MainnetNativeSwapPolicy.isReleased())
        supportDiagnostics.event(MainnetNativeSupportDiagnostics.Trace(senderAddress,quote.getString("nonce").toLong(),null,quote.getJSONObject("operation").getString("kind")),"swap_quote","ready", mapOf("assetId" to inputAsset,"outputAsset" to outputAsset,"amountWei" to amountWei,"gas" to quote.getString("gas")))
        promise.resolve(quote.toString())
      } catch (error: Exception) {
        val reason = error.message?.takeIf { it.matches(Regex("^swap_[a-z0-9_]{1,80}$")) } ?: "swap_quote_unavailable"
        supportDiagnostics.event(MainnetNativeSupportDiagnostics.Trace(senderAddress,null,null,"swap"),"swap_quote","stopped",mapOf("reason" to reason,"errorType" to error.javaClass.simpleName,"assetId" to inputAsset,"outputAsset" to outputAsset))
        val message = when(reason) {
          "swap_insufficient_balance" -> "Your balance does not cover this amount."
          "swap_insufficient_gas" -> "Add BNB for network fees before swapping."
          "swap_previous_transaction_pending" -> "Check your previous transaction in Activity first."
          "swap_device_clock" -> "Enable automatic date and time, then review again."
          "swap_amount_limit" -> "This amount exceeds the current wallet limit."
          "swap_rate_limited" -> "Please wait a minute, then review again."
          else -> "Swap review is unavailable. Try again or check Activity."
        }
        promise.reject("mainnet_swap_quote_unavailable", message)
      }
      finally { transferOperationGate.release(lease) }
    } } catch (_: Exception) { transferOperationGate.release(lease); promise.reject("mainnet_swap_quote_unavailable","Swap review is unavailable.") }
  }

  @ReactMethod
  fun sendNativeMainnetSwap(review: ReadableMap, authorizationEpoch: Double, promise: Promise) {
    if (!review.hasKey("swapOperation") || review.isNull("swapOperation")) { promise.reject("mainnet_swap_invalid", "Invalid swap review."); return }
    signingController.begin(reactApplicationContext.currentActivity as? FragmentActivity,review,authorizationEpoch,promise,
      submitSigned = { handle,hash,generation,lease,result -> broadcastController.beginAuthorized(reactApplicationContext.currentActivity as? FragmentActivity,handle,hash,generation,lease,result) })
  }

  @ReactMethod
  fun prepareNativeMainnetReplacement(senderAddress: String, nonce: Double, originalHash: String, kind: String, promise: Promise) {
    broadcastController.prepareReplacement(senderAddress, nonce, originalHash, kind, promise)
  }

  /** Public metadata only, encrypted journal is authoritative after process restart. */
  @ReactMethod
  fun getNativeMainnetTransferHistory(senderAddress: String, promise: Promise) {
    val lease = transferOperationGate.acquire()
    if (lease == null) { promise.reject("mainnet_native_operation_busy", "A native operation is still completing."); return }
    try {
      promise.resolve(Arguments.createArray().apply {
        nonceJournal.readTransferHistory(senderAddress).forEach { record -> pushMap(Arguments.createMap().apply {
          putInt("version", 1); putInt("chainId", 56); putString("transactionHash", record.rawTransactionHash)
          putString("senderAddress", record.senderAddress); putString("recipientAddress", record.recipientAddress)
          record.replacesTransactionHash?.let { putString("replacesTransactionHash", it); putString("replacementKind", record.replacementKind) }; record.cancelledByHash?.let { putString("cancelledByHash", it) }
          putString("assetId", record.assetId); putString("amountWei", record.amountWei)
          record.swapOperationJson?.let { text ->
            val op = MainnetNativeSwapPolicy.parse(org.json.JSONObject(text))
            putMap("operation",Arguments.createMap().apply {
              putString("kind",op.kind); putString("inputAsset",op.inputAsset); putString("outputAsset",op.outputAsset)
              putString("intentAmountWei",op.intentAmountWei); putString("minimumOutWei",op.minimumOutWei); putString("estimatedOutWei",op.estimatedOutWei)
              record.receivedAmountWei?.let { putString("receivedAmountWei",it) }
            })
          }
          putDouble("nonce", record.nonce.toDouble()); putDouble("submittedAt", record.createdAtMillis.toDouble())
          putString("receiptState", when (record.state) {
            MainnetEncryptedNonceJournal.State.CONFIRMED -> "confirmed"
            MainnetEncryptedNonceJournal.State.REVERTED -> "reverted"
            MainnetEncryptedNonceJournal.State.CANCELLED -> "cancelled"
            MainnetEncryptedNonceJournal.State.DROPPED -> "not-submitted"
            MainnetEncryptedNonceJournal.State.SIGNED, MainnetEncryptedNonceJournal.State.SIGNED_UNVERIFIED -> if (record.attemptCount == 0) "not-submitted" else "status-unavailable"
            else -> "status-unavailable"
          })
        }) }
      })
    } catch (_: Exception) { promise.reject("mainnet_native_history_unavailable", "Native transfer history could not be read.") }
    finally { transferOperationGate.release(lease) }
  }

  /** Read-only export: public queue metadata and diagnostic events; no network request or authorization. */
  @ReactMethod
  fun getNativeMainnetSupportReport(senderAddress: String, promise: Promise) {
    if (!senderAddress.matches(Regex("^0x[0-9a-fA-F]{40}$"))) { promise.reject("mainnet_support_invalid", "Invalid report address."); return }
    val lease = transferOperationGate.acquire()
    if (lease == null) { promise.reject("mainnet_native_operation_busy", "Wait for the current transfer to finish."); return }
    try {
      val report = supportDiagnostics.read(senderAddress)
      try {
        val records = (nonceJournal.readRecoveryQueue(senderAddress).reservations + nonceJournal.readTransferHistory(senderAddress))
          .distinctBy { "${it.nonce}:${it.rawTransactionHash}:${it.replacesTransactionHash}" }.take(52)
        report.put("nativeJournalStatus", "available")
        report.put("nativeRecords", org.json.JSONArray().apply { records.forEach { record ->
          val operationFields = record.swapOperationJson?.let { json -> MainnetNativeSwapPolicy.parse(org.json.JSONObject(json)).let { op ->
            mapOf("kind" to op.kind,"outputAsset" to op.outputAsset,"minimumOutWei" to op.minimumOutWei,"estimatedOutWei" to op.estimatedOutWei) }
          }.orEmpty() + listOfNotNull(record.receivedAmountWei?.let { "receivedAmountWei" to it }).toMap()
          val fields = operationFields + mapOf("nonce" to record.nonce.toString(), "journalState" to record.state.name,
            "attemptCount" to record.attemptCount.toString(), "hasTransferDetails" to (record.recipientAddress != null && record.assetId != null && record.amountWei != null).toString()) +
            listOfNotNull(record.rawTransactionHash?.let { "hash" to it }, record.replacesTransactionHash?.let { "originalHash" to it },
              record.recipientAddress?.let { "recipient" to it }, record.assetId?.let { "assetId" to it },
              record.amountWei?.let { "amountWei" to it }, record.gasPriceWei?.let { "gasPriceWei" to it }).toMap()
          put(org.json.JSONObject(MainnetSupportEventPolicy.clean(fields)))
        } })
      } catch (_: Exception) { report.put("nativeJournalStatus", "unavailable").put("nativeRecords", org.json.JSONArray()) }
      promise.resolve(report.toString())
    } catch (_: Exception) { promise.reject("mainnet_support_unavailable", "Support report could not be read.") }
    finally { transferOperationGate.release(lease) }
  }

  /** Opaque handle in; raw signed transaction remains native and goes only to the pinned relay. */
  @ReactMethod
  fun broadcastNativeMainnetTransfer(broadcastHandle: String, expectedHash: String, promise: Promise) {
    broadcastController.begin(reactApplicationContext.currentActivity as? FragmentActivity, broadcastHandle, expectedHash, promise)
  }

  /** Public evidence in; native code independently queries the pinned relay before journal transition. */
  @ReactMethod
  fun reconcileNativeMainnetReceipt(senderAddress: String, nonce: Double, transactionHash: String, promise: Promise) {
    // Status never interrupts an active transfer. The shared custody gate serializes it.
    broadcastController.reconcile(senderAddress, nonce, transactionHash, promise)
  }

  /** Reads public recovery metadata and a fresh fixed-network snapshot; cannot sign. */
  @ReactMethod
  fun getNativeMainnetRecoveryDiagnostics(review: ReadableMap, promise: Promise) {
    try {
      require(review.getInt("chainId") == 56)
      val sender = requireNotNull(review.getString("senderAddress"))
      val recipient = requireNotNull(review.getString("recipient"))
      val asset = when (review.getString("assetId")) {
        "native-bnb" -> MainnetFixedPreSignSnapshotClient.Asset.NATIVE_BNB
        "arxi" -> MainnetFixedPreSignSnapshotClient.Asset.ARXI
        "usdt" -> MainnetFixedPreSignSnapshotClient.Asset.USDT
        else -> throw IllegalArgumentException()
      }
      val nonceText = requireNotNull(review.getString("nonce"))
      val amountText = requireNotNull(review.getString("amount"))
      require(nonceText.matches(Regex("^(0|[1-9][0-9]{0,18})$")))
      require(amountText.matches(Regex("^[1-9][0-9]{0,77}$")))
      broadcastController.inspectRecovery(MainnetFixedPreSignSnapshotClient.Request(sender, recipient, asset, java.math.BigInteger(amountText)), nonceText.toLong(), promise)
    } catch (_: Exception) { promise.reject("mainnet_native_recovery_invalid", "Invalid Mainnet recovery request.") }
  }

  @ReactMethod
  fun getNativeMainnetVaultStatus(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putBoolean("present", nativeVaultMigration.hasNativeVault())
      putString("address", nativeVaultMigration.readAddress())
    })
  }

  private fun invalidateNativeOperations() {
    lifecycleGuard.invalidate(); authorizationRegistry.invalidateAll(); migrationController.cancelForLifecycle()
    signingController.cancelForLifecycle(); broadcastController.cancelForLifecycle()
  }
}
