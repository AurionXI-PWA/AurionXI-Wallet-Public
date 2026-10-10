package com.aurionxi.wallet.argon2

import com.lambdapioneer.argon2kt.Argon2Kt
import com.lambdapioneer.argon2kt.Argon2Mode
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

class AurionXiArgon2Module : Module() {
  private val memoryKiB = 19_456
  private val iterations = 2
  private val parallelism = 1
  private val hashLength = 32
  private val derivationInProgress = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("AurionXiArgon2")

    AsyncFunction("derivePinKeyAsync") { pin: String, saltHex: String ->
      require(pin.matches(Regex("^\\d{6}$"))) {
        "PIN must contain exactly 6 digits"
      }
      require(saltHex.matches(Regex("^[0-9a-fA-F]{32}$"))) {
        "Salt must be exactly 16 bytes encoded as hexadecimal"
      }
      check(derivationInProgress.compareAndSet(false, true)) {
        "A PIN key derivation is already in progress"
      }

      val pinBytes = pin.toByteArray(Charsets.UTF_8)
      val saltBytes = saltHex.chunked(2)
        .map { it.toInt(16).toByte() }
        .toByteArray()

      try {
        Argon2Kt().hash(
          Argon2Mode.ARGON2_ID,
          pinBytes,
          saltBytes,
          iterations,
          memoryKiB,
          parallelism,
          hashLength
        ).rawHashAsHexadecimal(false)
      } finally {
        pinBytes.fill(0)
        saltBytes.fill(0)
        derivationInProgress.set(false)
      }
    }
  }
}
