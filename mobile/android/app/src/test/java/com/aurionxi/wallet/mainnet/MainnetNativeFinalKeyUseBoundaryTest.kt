package com.aurionxi.wallet.mainnet

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MainnetNativeFinalKeyUseBoundaryTest {
  @Test
  fun `lifecycle invalidation during durable journal transition suppresses signing`() {
    val lifecycle = MainnetNativeLifecycleGuard()
    val guard = MainnetNativeSigningBoundaryGuard(
      lifecycle.capture(),
      Long.MAX_VALUE,
      lifecycle,
      { false },
      { 1L },
    )
    var durableSigningState = false
    var cryptographicUseInvoked = false

    try {
      MainnetNativeFinalKeyUseBoundary.execute(
        markSigning = {
          lifecycle.invalidate()
          true
        },
        onSigningStateDurable = { durableSigningState = true },
        requireActive = guard::requireActive,
        cryptographicUse = {
          cryptographicUseInvoked = true
          "signed"
        },
      )
      fail("Expected stale lifecycle rejection")
    } catch (_: IllegalArgumentException) {
      assertTrue(durableSigningState)
      assertFalse(cryptographicUseInvoked)
    }
  }

  @Test
  fun `failed durable journal transition suppresses signing and boundary crossing`() {
    var durableSigningState = false
    var cryptographicUseInvoked = false

    try {
      MainnetNativeFinalKeyUseBoundary.execute(
        markSigning = { false },
        onSigningStateDurable = { durableSigningState = true },
        requireActive = {},
        cryptographicUse = {
          cryptographicUseInvoked = true
          "signed"
        },
      )
      fail("Expected journal transition rejection")
    } catch (_: IllegalArgumentException) {
      assertFalse(durableSigningState)
      assertFalse(cryptographicUseInvoked)
    }
  }
}
