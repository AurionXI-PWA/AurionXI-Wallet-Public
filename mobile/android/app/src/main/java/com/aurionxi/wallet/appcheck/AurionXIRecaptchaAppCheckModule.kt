package com.aurionxi.wallet.appcheck

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.recaptcha.RecaptchaAppCheckProviderFactory

/** Direct APK-only Firebase App Check bridge. */
class AurionXIRecaptchaAppCheckModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private val installLock = Any()
    @Volatile private var installed = false
  }

  override fun getName() = "AurionXIRecaptchaAppCheck"

  override fun getConstants(): Map<String, Any> = mapOf("available" to isConfigured())

  @ReactMethod
  fun getToken(forceRefresh: Boolean, promise: Promise) {
    if (!isConfigured()) {
      promise.reject("E_APP_CHECK_NOT_CONFIGURED", "Direct reCAPTCHA Enterprise App Check is not configured for this APK.")
      return
    }

    try {
      FirebaseApp.initializeApp(reactContext)
      installProviderIfNeeded()
      FirebaseAppCheck.getInstance().getAppCheckToken(forceRefresh)
        .addOnSuccessListener { result -> promise.resolve(result.token) }
        .addOnFailureListener { error ->
          promise.reject("E_APP_CHECK_TOKEN", "Unable to get a Direct App Check token.", error)
        }
    } catch (error: Exception) {
      promise.reject("E_APP_CHECK_SETUP", "Unable to initialize Direct App Check.", error)
    }
  }

  private fun installProviderIfNeeded() {
    if (installed) return
    synchronized(installLock) {
      if (installed) return
      val siteKey = reactContext.getString(siteKeyResourceId()).trim()
      FirebaseAppCheck.getInstance().installAppCheckProviderFactory(
        RecaptchaAppCheckProviderFactory.getInstance(siteKey),
      )
      installed = true
    }
  }

  private fun isConfigured(): Boolean {
    val resourceId = siteKeyResourceId()
    return resourceId != 0 && reactContext.getString(resourceId).isNotBlank()
  }

  private fun siteKeyResourceId(): Int = reactContext.resources.getIdentifier(
    "aurionxi_recaptcha_enterprise_site_key",
    "string",
    reactContext.packageName,
  )
}
