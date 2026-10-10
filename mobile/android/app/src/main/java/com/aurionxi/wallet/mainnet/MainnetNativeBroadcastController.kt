package com.aurionxi.wallet.mainnet

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.recaptcha.RecaptchaAppCheckProviderFactory
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Trusted Send continuation (and legacy second action). All signed bytes remain native. */
internal class MainnetNativeBroadcastController(
  private val context: Context,
  private val payloadStore: MainnetNativeSignedPayloadStore,
  private val journal: MainnetEncryptedNonceJournal,
  private val lifecycleGuard: MainnetNativeLifecycleGuard,
  private val operationGate: MainnetNativeTransferOperationGate,
  private val supportDiagnostics: MainnetNativeSupportDiagnostics = MainnetNativeSupportDiagnostics(context),
) {
  private class Operation(val id: String, val generation: Long, val promise: Promise, val lease: MainnetNativeTransferOperationGate.Lease,
    val expectedHash: String, val automatic: Boolean = false) {
    val settled = AtomicBoolean(false); val cancelled = AtomicBoolean(false)
    val workerStarted = AtomicBoolean(false)
    @Volatile var submissionBarrier = false
    @Volatile var requestStarted = false
    @Volatile var appCheckActive = false
    @Volatile var entry: MainnetNativeSignedPayloadStore.Entry? = null
    @Volatile var supportTrace: MainnetNativeSupportDiagnostics.Trace? = null
    @Volatile var dialog: AlertDialog? = null
    @Volatile var connection: HttpURLConnection? = null
  }

  private val worker = Executors.newSingleThreadExecutor(); private val stateLock = Any(); private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile private var active: Operation? = null

  fun begin(activity: FragmentActivity?, handle: String, expectedHash: String, promise: Promise) {
    if (activity == null || activity.isFinishing || activity.isDestroyed || !expectedHash.matches(HASH)) { promise.reject("mainnet_native_broadcast_unavailable", "Native Mainnet broadcast is unavailable."); return }
    activity.runOnUiThread {
      val operation = synchronized(stateLock) {
        if (active != null || activity.isFinishing || activity.isDestroyed) null
        else operationGate.acquire()?.let { Operation(UUID.randomUUID().toString(), lifecycleGuard.capture(), promise, it, expectedHash).also { next -> active = next } }
      }
      if (operation == null) { promise.reject("mainnet_native_broadcast_unavailable", "Native Mainnet broadcast is unavailable."); return@runOnUiThread }
      val dialog = AlertDialog.Builder(activity)
        .setTitle("Broadcast signed Mainnet transaction?")
        .setMessage("Transaction hash:\n$expectedHash\n\nThis one-time native action submits the exact signed transaction to the pinned AurionXI relay.")
        .setCancelable(false)
        .setNegativeButton("Cancel") { _, _ -> cancel(operation, "mainnet_native_broadcast_cancelled", "Native Mainnet broadcast was cancelled.") }
        .setPositiveButton("Broadcast once") { _, _ -> acquireTokenThenSubmit(operation, handle, expectedHash) }
        .create()
      operation.dialog = dialog
      dialog.setOnShowListener { dialog.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE) }
      dialog.show()
    }
  }

  /** Native-only continuation of the exact trusted Send approval. No second UI/JS handle. */
  fun beginAuthorized(activity: FragmentActivity?, handle: String, expectedHash: String, generation: Long,
    lease: MainnetNativeTransferOperationGate.Lease, promise: Promise) {
    if (activity == null || activity.isFinishing || activity.isDestroyed || !lifecycleGuard.isCurrent(generation) || !operationGate.owns(lease)) {
      payloadStore.invalidate(handle); operationGate.release(lease)
      promise.resolve(outcome("not-submitted", expectedHash, "mainnet_native_broadcast_cancelled")); return
    }
    activity.runOnUiThread {
      if (!lifecycleGuard.isCurrent(generation) || !operationGate.owns(lease)) {
        payloadStore.invalidate(handle); operationGate.release(lease)
        promise.resolve(outcome("not-submitted", expectedHash, "mainnet_native_broadcast_cancelled")); return@runOnUiThread
      }
      val operation = synchronized(stateLock) {
        if (active != null) null else Operation(UUID.randomUUID().toString(), generation, promise, lease, expectedHash, true).also { active = it }
      }
      if (operation == null) {
        payloadStore.invalidate(handle); operationGate.release(lease)
        promise.resolve(outcome("not-submitted", expectedHash, "mainnet_native_broadcast_unavailable"))
      } else acquireTokenThenSubmit(operation, handle, expectedHash)
    }
  }

  fun cancelForLifecycle() {
    payloadStore.invalidateAll()
    synchronized(stateLock) { active }?.let { cancel(it, "mainnet_native_broadcast_cancelled", "Native Mainnet broadcast was cancelled by the app lifecycle.") }
  }
  /** Preserves only this exact Android-owned approval/App Check journey. */
  fun isTrustedUiActive(): Boolean = synchronized(stateLock) {
    active?.let { !it.settled.get() && (it.dialog != null || it.appCheckActive) } == true
  }
  fun invalidate() = cancelForLifecycle()
  fun shutdown() { cancelForLifecycle(); worker.shutdown() } // queued workers still execute cancellation checks and release custody

  fun inspectRecovery(request: MainnetFixedPreSignSnapshotClient.Request, reviewedNonce: Long, promise: Promise) {
    val generation = lifecycleGuard.capture()
    if (!request.senderAddress.matches(ADDRESS) || !request.recipientAddress.matches(ADDRESS) || reviewedNonce < 0) {
      promise.reject("mainnet_native_recovery_invalid", "Invalid Mainnet recovery request."); return
    }
    val lease = operationGate.acquire()
    if (lease == null) { promise.reject("mainnet_native_operation_busy", "A native transfer is still completing. Check status shortly."); return }
    worker.execute {
      try {
        require(lifecycleGuard.isCurrent(generation))
        // Snapshot failure does not hide existing journal metadata.
        val liveNonce = try { MainnetFixedPreSignSnapshotClient().read(request).pendingNonce.longValueExact() } catch (_: Exception) { null }
        require(lifecycleGuard.isCurrent(generation))
        val records = journal.readRecoveryQueue(request.senderAddress.lowercase()).reservations
        val reason = MainnetNativeRecoveryDiagnostics.reason(records, reviewedNonce, liveNonce)
        Log.i("AurionXIMainnetSigner", "Native Mainnet recovery: ${MainnetNativeRecoveryDiagnostics.summary(records, reviewedNonce, liveNonce)}")
        promise.resolve(Arguments.createMap().apply {
          putInt("chainId", 56)
          putString("senderAddress", request.senderAddress.lowercase())
          putString("reviewedNonce", reviewedNonce.toString())
          if (liveNonce == null) putNull("livePendingNonce") else putString("livePendingNonce", liveNonce.toString())
          putInt("recordCount", records.size)
          putString("reason", reason)
          putArray("records", Arguments.createArray().apply {
            records.take(32).forEach { record -> pushMap(Arguments.createMap().apply {
              putString("nonce", record.nonce.toString())
              putString("state", record.state.name)
              record.replacesTransactionHash?.let { putString("replacesTransactionHash", it) }
              if (record.rawTransactionHash == null) putNull("transactionHash") else putString("transactionHash", record.rawTransactionHash)
            }) }
          })
        })
      } catch (_: Exception) { promise.reject("mainnet_native_recovery_unavailable", "Native Mainnet recovery diagnostics are unavailable; no record was changed.") }
      finally { operationGate.release(lease) }
    }
  }

  /** Resolves a public pointer against native journal authority; this method cannot sign. */
  fun prepareReplacement(sender: String, nonce: Double, originalHash: String, kind: String, promise: Promise) {
    if (kind !in setOf("cancel", "speed-up") || !sender.matches(ADDRESS) || !originalHash.matches(HASH) || !nonce.isFinite() || nonce < 0 || nonce > 9_007_199_254_740_991.0 || nonce % 1.0 != 0.0) { promise.reject("mainnet_native_cancellation_invalid", "Invalid cancellation record."); return }
    val trace = MainnetNativeSupportDiagnostics.Trace(sender, nonce.toLong(), originalHash, kind)
    supportDiagnostics.event(trace, "prepare", "started")
    val generation = lifecycleGuard.capture()
    if (journal.read(sender, nonce.toLong())?.swapOperationJson != null) { promise.reject("mainnet_swap_replacement_unavailable", "Use Check status for this operation."); return }
    val lease = operationGate.acquire()
    if (lease == null) { supportDiagnostics.event(trace, "gate", "stopped", mapOf("errorCode" to "mainnet_native_operation_busy")); promise.reject("mainnet_native_operation_busy", "A native operation is still completing."); return }
    getAppCheckToken(success = { token ->
      try { worker.execute {
      var stage = "receipt"
      try {
        require(lifecycleGuard.isCurrent(generation))
        MainnetNativeReplacementRecovery.reconcile(journal.readRecoveryQueue(sender).reservations, nonce.toLong(),
          inspect = { record -> readReceipt(requireNotNull(record.rawTransactionHash), token, generation, trace) },
          settle = { record, state -> journal.markReceiptVerified(record, requireNotNull(record.rawTransactionHash), state) },
          requireActive = { require(lifecycleGuard.isCurrent(generation)) })
        stage = "original"
        val original = requireNotNull(journal.read(sender, nonce.toLong()))
        supportDiagnostics.event(trace, "original", "observed", mapOf("journalState" to original.state.name, "attemptCount" to original.attemptCount.toString(),
          "hasTransferDetails" to (original.recipientAddress != null && original.assetId != null && original.amountWei != null).toString()))
        require(original.state == MainnetEncryptedNonceJournal.State.SUBMITTED && original.rawTransactionHash.equals(originalHash, true))
        stage = "previous_records"
        val records = journal.readRecoveryQueue(sender).reservations
        supportDiagnostics.event(trace, "previous_records", "observed", mapOf("recordCount" to records.size.toString()))
        records.take(32).forEach { record -> supportDiagnostics.event(trace, "queue_record", "observed", mapOf("recordNonce" to record.nonce.toString(), "hash" to (record.rawTransactionHash ?: ""), "journalState" to record.state.name)) }
        require(records.all { it == original || MainnetNativeReplacementPolicy.related(original, it) })
        stage = "details"
        val asset = if (kind == "cancel") MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB else when (original.assetId) {
          "native-bnb" -> MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB
          "arxi" -> MainnetNativeIntentSemanticVerifier.Asset.ARXI
          "usdt" -> MainnetNativeIntentSemanticVerifier.Asset.USDT
          else -> error("Unsupported original asset")
        }
        val recipient = if (kind == "cancel") original.senderAddress else requireNotNull(original.recipientAddress)
        val amount = if (kind == "cancel") java.math.BigInteger.ZERO else java.math.BigInteger(requireNotNull(original.amountWei))
        val snapshotAsset = MainnetFixedPreSignSnapshotClient.Asset.values().single { it.wireValue == asset.wireValue }
        stage = "quote"
        val snapshot = MainnetFixedPreSignSnapshotClient().read(MainnetFixedPreSignSnapshotClient.Request(sender, recipient, snapshotAsset, amount, original.rawTransactionHash, java.math.BigInteger.valueOf(original.nonce), kind, journal.readNonceAttempts(sender, original.nonce).mapNotNull { it.gasPriceWei?.let { price -> java.math.BigInteger(price) } }.maxOrNull()),
          observe = { fields -> supportDiagnostics.event(trace, "quote", "observed", fields) })
        val receivedAt = System.currentTimeMillis()
        val quoteTime = try { java.time.Instant.parse(snapshot.observedAt).toEpochMilli() } catch (_: Exception) { null }
        supportDiagnostics.event(trace, "quote_time", "observed", mapOf("deviceTime" to receivedAt.toString()) +
          (quoteTime?.let { mapOf("quoteTime" to it.toString(), "clockDeltaMs" to (receivedAt - it).toString()) } ?: emptyMap()))
        stage = "clock"
        val review = MainnetNativeReplacementReviewBuilder.build(original, kind, snapshot, System.currentTimeMillis())
        stage = "policy"
        require(MainnetNativeReplacementPolicy.matchesOriginal(review, original))
        MainnetNativeSigningReleaseGate.requireReleased(review)
        require(lifecycleGuard.isCurrent(generation) && journal.read(sender, original.nonce) == original)
        supportDiagnostics.event(trace, "review", "ready", mapOf("recipient" to review.recipientAddress, "assetId" to review.asset.wireValue,
          "amountWei" to review.amountWei.toString(), "gas" to review.gasLimit.toString(), "gasPriceWei" to review.gasPriceWei.toString()))
        promise.resolve(Arguments.createMap().apply {
          putInt("chainId", 56); putString("senderAddress", review.senderAddress); putString("recipient", review.recipientAddress)
          putString("assetId", review.asset.wireValue); if (review.assetContract == null) putNull("assetContract") else putString("assetContract", review.assetContract); putString("amount", review.amountWei.toString())
          putString("nonce", review.nonce.toString()); putString("gas", review.gasLimit.toString()); putString("gasPrice", review.gasPriceWei.toString())
          putString("observedAt", review.observedAtMillis.toString()); putString("replacesTransactionHash", review.replacesTransactionHash); putString("replacementKind", review.replacementKind)
        })
      } catch (error: Exception) {
        val code = when (error) { is MainnetPreSignSnapshotException -> error.publicCode; is MainnetReplacementReviewException -> error.publicCode; else -> "mainnet_native_replacement_$stage" }
        supportDiagnostics.event(trace, stage, "stopped", mapOf("errorCode" to code, "errorType" to error.javaClass.simpleName, "reason" to (if (error is MainnetReplacementReviewException) error.publicCode else "stage_guard"), "lifecycleCurrent" to lifecycleGuard.isCurrent(generation).toString()))
        Log.i("AurionXIMainnetSigner", "Replacement preparation stopped: $code")
        val message = if (error is MainnetReplacementReviewException && error.publicCode != "mainnet_replacement_clock_invalid")
          "The fee response does not match this transfer or its allowed fee. Review again."
        else when (stage) {
          "receipt" -> "Previous transaction receipt could not be checked. Check status and try again; records are retained."
          "original" -> "The original transaction is already settled or its native record does not match. Check status."
          "previous_records" -> "Another nonce still needs receipt recovery. Check previous transaction status first."
          "details" -> "The original native record lacks transfer details for a safe retry. Its hash is retained; check status or review Cancel."
          "clock" -> "Fee review time is invalid. Enable automatic date and time on the phone, then review again."
          "policy" -> "This replacement does not meet this APK's native transfer policy."
          else -> if (error is MainnetPreSignSnapshotException) error.message else "The replacement fee quote is unavailable. Check status and try again."
        }
        promise.reject(code, message)
      }
      finally { operationGate.release(lease) }
      } } catch (_: Exception) { supportDiagnostics.event(trace, "worker", "stopped", mapOf("errorCode" to "mainnet_native_replacement_worker")); operationGate.release(lease); promise.reject("mainnet_native_replacement_worker", "Native recovery worker is unavailable.") }
    }, failure = { supportDiagnostics.event(trace, "app_check", "stopped", mapOf("errorCode" to "mainnet_native_app_check_failed")); operationGate.release(lease); promise.reject("mainnet_native_app_check_failed", "Native App Check failed. Check status and try again.") })
  }

  fun reconcile(sender: String, nonce: Double, transactionHash: String, promise: Promise) {
    val generation = lifecycleGuard.capture()
    if (!sender.matches(ADDRESS) || !transactionHash.matches(HASH) || !nonce.isFinite() || nonce < 0 || nonce > 9_007_199_254_740_991.0 || nonce % 1.0 != 0.0) { promise.reject("mainnet_native_reconcile_invalid", "Invalid Mainnet reconciliation input."); return }
    val trace = MainnetNativeSupportDiagnostics.Trace(sender, nonce.toLong(), transactionHash, "check-status")
    supportDiagnostics.event(trace, "status", "started")
    val record = try { journal.readForHash(sender.lowercase(), nonce.toLong(), transactionHash) } catch (_: Exception) {
      supportDiagnostics.event(trace, "journal", "unavailable", mapOf("errorCode" to "mainnet_native_history_unavailable"))
      promise.reject("mainnet_native_history_unavailable", "The native journal could not be read; no record was changed."); return
    }
    if (record != null) supportDiagnostics.event(trace, "journal", "observed", mapOf("journalState" to record.state.name, "attemptCount" to record.attemptCount.toString()))
    if (record != null && record.rawTransactionHash?.equals(transactionHash, true) != true) { promise.reject("mainnet_native_reconcile_mismatch", "No matching signed native transaction exists."); return }
    if (record?.state == MainnetEncryptedNonceJournal.State.CONFIRMED || record?.state == MainnetEncryptedNonceJournal.State.REVERTED) {
      promise.resolve(if (record?.state == MainnetEncryptedNonceJournal.State.CONFIRMED) "confirmed" else "reverted"); return
    }
    if (record?.state == MainnetEncryptedNonceJournal.State.CANCELLED) { promise.resolve("cancelled"); return }
    if (record?.state == MainnetEncryptedNonceJournal.State.DROPPED) { promise.resolve("not-submitted"); return }
    if (record != null && !MainnetNativeReceiptRecoveryPolicy.mayInspect(record.state)) { promise.reject("mainnet_native_reconcile_mismatch", "No matching signed native transaction exists."); return }
    val lease = operationGate.acquire()
    if (lease == null) { supportDiagnostics.event(trace, "gate", "stopped", mapOf("errorCode" to "mainnet_native_operation_busy")); promise.reject("mainnet_native_operation_busy", "A native transfer is still completing. Check status shortly."); return }
    payloadStore.invalidateAll()
    getAppCheckToken(
      success = { token ->
        if (lifecycleGuard.isCurrent(generation)) try {
          worker.execute { try { if (record == null) {
              try { promise.resolve(readReceipt(transactionHash, token, generation, trace)) }
              catch (_: Exception) { promise.reject("mainnet_native_reconcile_failed", "Legacy transaction receipt is unavailable; no journal record was changed.") }
            } else reconcileReceipt(record, token, generation, promise, trace) } finally { operationGate.release(lease) } }
        } catch (_: Exception) { operationGate.release(lease); promise.reject("mainnet_native_reconcile_unavailable", "Native status worker is unavailable.") }
        else { operationGate.release(lease); promise.reject("mainnet_native_reconcile_cancelled", "Native receipt reconciliation was cancelled.") }
      },
      failure = { supportDiagnostics.event(trace, "app_check", "stopped", mapOf("errorCode" to "mainnet_native_app_check_failed")); operationGate.release(lease); promise.reject("mainnet_native_app_check_failed", "Native App Check verification failed closed.") },
    )
  }

  private fun acquireTokenThenSubmit(operation: Operation, handle: String, expectedHash: String) {
    if (!isCurrent(operation)) { cancel(operation, "mainnet_native_broadcast_cancelled", "Native Mainnet broadcast was cancelled."); return }
    val entry = payloadStore.consume(handle, expectedHash, System.currentTimeMillis())
    if (entry == null) { fail(operation, "mainnet_native_broadcast_expired", "The signed Mainnet transaction expired or was already consumed."); return }
    operation.entry = entry
    operation.supportTrace = MainnetNativeSupportDiagnostics.Trace(entry.review.senderAddress, entry.review.nonce.longValueExact(), entry.review.replacesTransactionHash, entry.review.swapOperation?.kind ?: entry.review.replacementKind ?: "send", operation.id)
    operation.supportTrace?.let { supportDiagnostics.event(it, "broadcast", "started", mapOf("hash" to entry.transactionHash)) }
    if (operation.automatic && !entry.sendApproved) { fail(operation, "mainnet_native_broadcast_not_approved", "Trusted Send approval is required."); return }
    operation.appCheckActive = true
    getAppCheckToken(
      success = { token ->
        operation.appCheckActive = false
        if (!isCurrent(operation)) cancel(operation, "mainnet_native_broadcast_cancelled", "Native Mainnet broadcast was cancelled.")
        else {
          operation.workerStarted.set(true)
          try { worker.execute { submit(operation, token) } }
          catch (_: Exception) { operation.workerStarted.set(false); fail(operation, "mainnet_native_broadcast_unavailable", "Native submission worker is unavailable.") }
        }
      },
      failure = { operation.appCheckActive = false; fail(operation, "mainnet_native_app_check_failed", "Native App Check verification failed closed.") },
    )
  }

  private fun getAppCheckToken(success: (String) -> Unit, failure: () -> Unit) {
    val settled = AtomicBoolean(false)
    val timeout = Runnable { if (settled.compareAndSet(false, true)) failure() }
    mainHandler.postDelayed(timeout, 20_000L)
    fun failOnce() {
      if (settled.compareAndSet(false, true)) { mainHandler.removeCallbacks(timeout); failure() }
    }
    try {
      FirebaseApp.initializeApp(context)
      val siteKeyId = context.resources.getIdentifier("aurionxi_recaptcha_enterprise_site_key", "string", context.packageName)
      require(siteKeyId != 0 && context.getString(siteKeyId).isNotBlank())
      FirebaseAppCheck.getInstance().installAppCheckProviderFactory(RecaptchaAppCheckProviderFactory.getInstance(context.getString(siteKeyId).trim()))
      FirebaseAppCheck.getInstance().getAppCheckToken(false)
        .addOnSuccessListener { result ->
          if (result.token.isBlank()) failOnce()
          else if (settled.compareAndSet(false, true)) { mainHandler.removeCallbacks(timeout); success(result.token) }
        }
        .addOnFailureListener { failOnce() }
    } catch (_: Exception) { failOnce() }
  }

  private fun submit(operation: Operation, appCheckToken: String) {
    var localConnection: HttpURLConnection? = null
    try {
      require(isCurrent(operation) && operationGate.owns(operation.lease)) // after App Check
      val entry = requireNotNull(operation.entry); val review = entry.review
      require(System.currentTimeMillis() < entry.expiresAtMillis) { "mainnet_native_broadcast_expired" }
      require(MainnetNativeSigningReleaseGate.isReleased() && appCheckToken.isNotBlank())
      require(isCurrent(operation)) // immediately before journal transition
      require(journal.markSubmitted(review.senderAddress, review.nonce.longValueExact(), entry.reviewDigest, entry.authorizationId, entry.transactionHash, review.replacesTransactionHash))
      operation.submissionBarrier = true
      require(isCurrent(operation)) // immediately before opening the pinned connection
      val connection = (URL(if(review.swapOperation == null) ENDPOINT else SWAP_ENDPOINT).openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"; connectTimeout = 15_000; readTimeout = 20_000; doOutput = true
        setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", "application/json"); setRequestProperty("X-Firebase-AppCheck", appCheckToken)
      }
      localConnection = connection
      operation.connection = connection
      require(isCurrent(operation))
      val payload = JSONObject().apply {
        put("serializedTransaction", entry.rawTransaction); put("expectedHash", entry.transactionHash)
        put("senderAddress", review.senderAddress); put("recipientAddress", review.recipientAddress)
        put("asset", review.asset.wireValue)
        review.swapOperation?.let { put("swapOperation",it.json()) }
        review.replacesTransactionHash?.let { put("replacesTransactionHash", it); put("replacementKind", review.replacementKind) }
        put("amountWei", review.amountWei.toString()); put("nonce", review.nonce.toString())
        put("gasLimit", review.gasLimit.toString()); put("gasPriceWei", review.gasPriceWei.toString())
      }.toString()
      synchronized(stateLock) {
        require(System.currentTimeMillis() < entry.expiresAtMillis && isCurrent(operation)) { "mainnet_native_broadcast_expired" }
        operation.requestStarted = true // cancellation after this boundary must report uncertainty
      }
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { it.write(payload) }
      require(isCurrent(operation))
      val status = connection.responseCode
      operation.supportTrace?.let { supportDiagnostics.event(it, "broadcast_http", "observed", mapOf("httpStatus" to status.toString(), "hash" to entry.transactionHash)) }
      val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
      val response = JSONObject(body)
      if (status !in 200..299 && response.optString("submissionState") == "not-submitted") {
        require(operationGate.owns(operation.lease))
        require(journal.markSubmissionNotSent(review.senderAddress, review.nonce.longValueExact(), entry.reviewDigest, entry.authorizationId, entry.transactionHash,
          MainnetNativeNonSubmissionPolicy.Evidence.PINNED_RELAY_REJECTED_BEFORE_RPC, review.replacesTransactionHash))
        operation.submissionBarrier = false
        fail(operation, response.optString("error", "mainnet_broadcast_rejected"), "The relay did not submit this transaction."); return
      }
      require(isCurrent(operation) && status == HttpURLConnection.HTTP_OK && response.optBoolean("accepted") && response.optString("hash").equals(entry.transactionHash, true))
      succeed(operation, entry.transactionHash)
    } catch (error: Exception) {
      if (operation.submissionBarrier && !operation.requestStarted) {
        val entry = operation.entry
        if (entry != null && operationGate.owns(operation.lease)) try {
          if (journal.markSubmissionNotSent(entry.review.senderAddress, entry.review.nonce.longValueExact(), entry.reviewDigest, entry.authorizationId, entry.transactionHash,
            MainnetNativeNonSubmissionPolicy.Evidence.BEFORE_NETWORK_IO, entry.review.replacesTransactionHash)) operation.submissionBarrier = false
        } catch (_: Exception) { /* retain the submission barrier on storage failure */ }
      }
      fail(operation, if (error.message == "mainnet_native_broadcast_expired") "mainnet_native_broadcast_expired" else "mainnet_native_broadcast_failed", "Native Mainnet broadcast did not complete; check status before retrying.")
    } finally {
      // Cleanup is independent of promise settlement. This closes the race in
      // which cancellation wins immediately before the local connection is assigned.
      localConnection?.disconnect()
      if (operation.connection === localConnection) operation.connection = null
      operation.entry = null
      operation.workerStarted.set(false)
      operationGate.release(operation.lease)
    }
  }

  /** Exact-hash read for both journal recovery and legacy public history. Never creates a journal record. */
  private fun readReceipt(hash: String, appCheckToken: String, generation: Long, trace: MainnetNativeSupportDiagnostics.Trace? = null): String {
    require(lifecycleGuard.isCurrent(generation) && hash.matches(HASH) && appCheckToken.isNotBlank())
    val connection = (URL(RECEIPT_ENDPOINT).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"; connectTimeout = 15_000; readTimeout = 20_000; doOutput = true
      setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", "application/json"); setRequestProperty("X-Firebase-AppCheck", appCheckToken)
    }
    try {
      OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { it.write(JSONObject().put("transactionHash", hash).toString()) }
      val status = connection.responseCode
      val body = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
      trace?.let { supportDiagnostics.event(it, "receipt_http", "observed", mapOf("hash" to hash, "httpStatus" to status.toString())) }
      require(lifecycleGuard.isCurrent(generation) && status == HttpURLConnection.HTTP_OK)
      val response = JSONObject(body)
      val state = requireNotNull(MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, response.optString("hash"), response.optString("state")))
      trace?.let { supportDiagnostics.event(it, "receipt", state, mapOf("hash" to hash,
        "reason" to if (state == "unknown") "receipt_and_transaction_not_found" else if (state == "pending") "transaction_found_without_receipt" else "exact_receipt_verified")) }
      return state
    } catch (error: Exception) {
      trace?.let { supportDiagnostics.event(it, "receipt", "unavailable", mapOf("hash" to hash, "errorType" to error.javaClass.simpleName,
        "reason" to if (error is java.net.SocketTimeoutException) "timeout" else if (!lifecycleGuard.isCurrent(generation)) "lifecycle_changed" else "transport_or_response_validation")) }
      throw error
    } finally { connection.disconnect() }
  }

  private fun readSwapReceipt(record: MainnetEncryptedNonceJournal.Reservation, token: String, generation: Long): JSONObject {
    require(lifecycleGuard.isCurrent(generation))
    val op=MainnetNativeSwapPolicy.parse(JSONObject(requireNotNull(record.swapOperationJson)))
    val connection=(URL(SWAP_RECEIPT_ENDPOINT).openConnection() as HttpURLConnection).apply { requestMethod="POST";connectTimeout=15000;readTimeout=20000;doOutput=true;setRequestProperty("Content-Type","application/json");setRequestProperty("X-Firebase-AppCheck",token) }
    try {
      val payload=JSONObject().put("transactionHash",record.rawTransactionHash).put("senderAddress",record.senderAddress).put("swapOperation",op.json())
      connection.outputStream.bufferedWriter(StandardCharsets.UTF_8).use { it.write(payload.toString()) }
      require(connection.responseCode==200 && lifecycleGuard.isCurrent(generation))
      val text=connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() };require(text.length<=4096)
      val response=JSONObject(text)
      require(MainnetNativeReceiptRecoveryPolicy.verifiedState(requireNotNull(record.rawTransactionHash),response.getString("hash"),response.getString("state"))!=null)
      if(response.getString("state")=="confirmed") {
        require(response.getString("operationKind")==op.kind)
        if(op.kind=="swap") require(response.getString("outputAsset")==op.outputAsset && MainnetNativeSwapPolicy.number(response.getString("receivedAmountWei")) >= MainnetNativeSwapPolicy.number(op.minimumOutWei))
      }
      return response
    }finally{connection.disconnect()}
  }

  private fun reconcileReceipt(record: MainnetEncryptedNonceJournal.Reservation, appCheckToken: String, generation: Long, promise: Promise, trace: MainnetNativeSupportDiagnostics.Trace) {
    try {
      val swapReceipt = record.swapOperationJson?.let { readSwapReceipt(record, appCheckToken, generation) }
      val state = swapReceipt?.getString("state") ?: readReceipt(requireNotNull(record.rawTransactionHash), appCheckToken, generation, trace)
      if (state in setOf("confirmed", "reverted")) {
        require(journal.markReceiptVerified(record, requireNotNull(record.rawTransactionHash), state, swapReceipt?.optString("receivedAmountWei")?.takeIf { it.isNotBlank() }, swapReceipt?.optString("operationKind")))
        supportDiagnostics.event(trace, "journal_settlement", state, mapOf("hash" to requireNotNull(record.rawTransactionHash)))
      }
      promise.resolve(state)
    } catch (_: Exception) { promise.reject("mainnet_native_reconcile_failed", "Native Mainnet receipt reconciliation failed; the record is retained.") }
  }

  private fun isCurrent(operation: Operation) = synchronized(stateLock) { active?.id == operation.id && active === operation && lifecycleGuard.isCurrent(operation.generation) && !operation.cancelled.get() && !operation.settled.get() }
  private fun cancel(operation: Operation, code: String, message: String) { operation.cancelled.set(true); operation.connection?.disconnect(); mainHandler.post { operation.dialog?.dismiss() }; fail(operation, code, message) }
  private fun fail(operation: Operation, code: String, message: String) {
    if (operation.settled.compareAndSet(false, true)) {
      val uncertain = operation.submissionBarrier
      operation.supportTrace?.let { supportDiagnostics.event(it, "broadcast", if (uncertain) "submission_unknown" else "not_submitted",
        mapOf("errorCode" to code, "hash" to operation.expectedHash, "requestStarted" to operation.requestStarted.toString(), "submissionBarrier" to uncertain.toString())) }
      clear(operation)
      if (!operation.workerStarted.get()) operationGate.release(operation.lease)
      if (operation.automatic) operation.promise.resolve(outcome(if (uncertain) "submission-unknown" else "not-submitted", operation.expectedHash, code))
      else operation.promise.reject(code, message)
    }
  }
  private fun succeed(operation: Operation, hash: String) { if (operation.settled.compareAndSet(false, true)) { operation.supportTrace?.let { supportDiagnostics.event(it, "broadcast", "submitted", mapOf("hash" to hash)) }; clear(operation); if (operation.automatic) operation.promise.resolve(outcome("submitted", hash, null)) else operation.promise.resolve(hash) } }
  private fun clear(operation: Operation) {
    val dialog = operation.dialog
    operation.connection = null
    if (!operation.workerStarted.get()) operation.entry = null
    operation.dialog = null
    operation.appCheckActive = false
    synchronized(stateLock) { if (active === operation) active = null }
    mainHandler.post { if (dialog?.isShowing == true) dialog.dismiss() }
  }

  private fun outcome(state: String, hash: String, errorCode: String?) = Arguments.createMap().apply {
    putString("state", state); putString("transactionHash", hash)
    if (errorCode == null) putNull("errorCode") else putString("errorCode", errorCode)
  }

  private companion object {
    const val ENDPOINT = "https://asia-south1-aurionxi.cloudfunctions.net/walletMainnetBroadcast/v1/bsc-mainnet/broadcast"
    const val SWAP_ENDPOINT = "https://asia-south1-aurionxi.cloudfunctions.net/walletMainnetBroadcast/v1/bsc-mainnet/swap-broadcast"
    const val SWAP_RECEIPT_ENDPOINT = "https://asia-south1-aurionxi.cloudfunctions.net/walletMainnetBroadcast/v1/bsc-mainnet/swap-receipt"
    const val RECEIPT_ENDPOINT = "https://asia-south1-aurionxi.cloudfunctions.net/walletMainnetBroadcast/v1/bsc-mainnet/receipt"
    val ADDRESS = Regex("^0x[0-9a-fA-F]{40}$"); val HASH = Regex("^0x[0-9a-fA-F]{64}$")
  }
}
