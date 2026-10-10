package com.aurionxi.wallet.mainnet

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import com.aurionxi.wallet.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Bounded, durable public diagnostics. Never participates in nonce authority or changes transfer outcomes. */
internal class MainnetNativeSupportDiagnostics(private val context: Context) {
  private val preferences = context.getSharedPreferences("aurionxi.mainnet.support-events.v1", Context.MODE_PRIVATE)
  @Volatile private var writeFailed = false
  internal class Trace(val sender: String, val nonce: Long?, val hash: String?, val kind: String,
    val id: String = UUID.randomUUID().toString(), val started: Long = SystemClock.elapsedRealtime())

  fun event(trace: Trace, stage: String, outcome: String, fields: Map<String, String> = emptyMap()) {
    try {
      val safe = MainnetSupportEventPolicy.clean(fields + mapOf("operationId" to trace.id,
        "sender" to trace.sender.lowercase(), "kind" to trace.kind,
        "stage" to stage, "outcome" to outcome, "elapsedMs" to (SystemClock.elapsedRealtime() - trace.started).coerceAtLeast(0).toString())
        + (trace.nonce?.let { mapOf("nonce" to it.toString()) } ?: emptyMap())
        + (trace.hash?.let { mapOf("originalHash" to it.lowercase()) } ?: emptyMap()))
      val event = JSONObject(safe).put("at", System.currentTimeMillis())
      synchronized(lock) {
        val old = try { JSONArray(preferences.getString("events", "[]")) } catch (_: Exception) { preferences.edit().putBoolean("historyReset", true).apply(); JSONArray() }
        val next = JSONArray()
        for (i in maxOf(0, old.length() - 127) until old.length()) next.put(old.getJSONObject(i))
        next.put(event)
        val saved = preferences.edit().putString("events", next.toString()).putBoolean("lastWriteFailed", false).commit()
        writeFailed = !saved
        if (!saved) preferences.edit().putBoolean("lastWriteFailed", true).apply()
      }
      Log.i("AurionXIMainnetSigner", "Support event: $event")
    } catch (_: Exception) { writeFailed = true; Log.i("AurionXIMainnetSigner", "Support diagnostic storage unavailable") }
  }

  fun read(sender: String): JSONObject = synchronized(lock) {
    require(sender.matches(Regex("^0x[0-9a-fA-F]{40}$")))
    var status = if (writeFailed || preferences.getBoolean("lastWriteFailed", false)) "write_failed" else "available"
    val result = JSONArray()
    try {
      val events = JSONArray(preferences.getString("events", "[]"))
      for (i in 0 until events.length()) {
        val e = events.getJSONObject(i)
        val fields = e.keys().asSequence().filter { it != "at" }.associateWith { e.optString(it) }
        val safe = MainnetSupportEventPolicy.clean(fields)
        if (safe["sender"].equals(sender, true) && e.optLong("at", -1) >= 0) result.put(JSONObject(safe).put("at", e.getLong("at")))
      }
    } catch (_: Exception) { status = "unreadable" }
    JSONObject().put("schemaVersion", 1).put("chainId", 56).put("sender", sender.lowercase())
      .put("generatedAt", System.currentTimeMillis()).put("reportId", UUID.randomUUID().toString())
      .put("packageName", context.packageName).put("versionName", BuildConfig.VERSION_NAME)
      .put("buildFingerprint", BuildConfig.MAINNET_SUPPORT_BUILD_FINGERPRINT)
      .put("automaticTime", try { Settings.Global.getInt(context.contentResolver, Settings.Global.AUTO_TIME) == 1 } catch (_: Exception) { JSONObject.NULL })
      .put("storageStatus", status).put("historyReset", preferences.getBoolean("historyReset", false)).put("retentionLimit", 128).put("events", result)
  }
  private companion object { val lock = Any() }
}
