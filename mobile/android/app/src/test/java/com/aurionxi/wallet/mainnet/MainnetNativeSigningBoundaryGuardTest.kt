package com.aurionxi.wallet.mainnet

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicBoolean

class MainnetNativeSigningBoundaryGuardTest {
  @Test fun `uses strict deterministic expiry boundary`() {
    val lifecycle = MainnetNativeLifecycleGuard(); var now = 999L
    val guard = MainnetNativeSigningBoundaryGuard(lifecycle.capture(), 1_000L, lifecycle, { false }, { now })
    assertTrue(guard.isActive())
    now = 1_000L; assertFalse(guard.isActive())
    now = 1_001L; assertFalse(guard.isActive())
  }

  @Test fun `lifecycle generation can never become current again`() {
    val lifecycle = MainnetNativeLifecycleGuard()
    val guard = MainnetNativeSigningBoundaryGuard(lifecycle.capture(), Long.MAX_VALUE, lifecycle, { false }, { 1L })
    assertTrue(guard.isActive()); lifecycle.invalidate(); assertFalse(guard.isActive()); lifecycle.invalidate(); assertFalse(guard.isActive())
  }

  @Test fun `explicit cancellation revokes the boundary`() {
    val lifecycle = MainnetNativeLifecycleGuard(); val cancelled = AtomicBoolean(false)
    val guard = MainnetNativeSigningBoundaryGuard(lifecycle.capture(), Long.MAX_VALUE, lifecycle, cancelled::get, { 1L })
    assertTrue(guard.isActive()); cancelled.set(true); assertFalse(guard.isActive())
  }
}
