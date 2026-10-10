package com.aurionxi.wallet.mainnet

import java.math.BigInteger
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MainnetNativeHandleIssuerTest {
  @Test
  fun `expiry after store insertion invalidates the new handle`() {
    val clockValues = ArrayDeque(listOf(99L, 100L))
    val lifecycle = MainnetNativeLifecycleGuard()
    val guard = MainnetNativeSigningBoundaryGuard(lifecycle.capture(), 100L, lifecycle, { false }) { clockValues.removeFirst() }
    val store = MainnetNativeSignedPayloadStore()
    val issuer = MainnetNativeHandleIssuer(store) { 99L }

    try {
      issuer.issue(entry(), guard) { true }
      fail("Expected exact-expiry rejection")
    } catch (_: IllegalArgumentException) {
      assertTrue(store.isEmpty())
    }
  }

  @Test
  fun `stale operation after store insertion invalidates the new handle`() {
    val lifecycle = MainnetNativeLifecycleGuard()
    val guard = MainnetNativeSigningBoundaryGuard(lifecycle.capture(), 100L, lifecycle, { false }) { 99L }
    val store = MainnetNativeSignedPayloadStore()
    val issuer = MainnetNativeHandleIssuer(store) { 99L }
    var checks = 0

    try {
      issuer.issue(entry(), guard) { ++checks == 1 }
      fail("Expected stale-operation rejection")
    } catch (_: IllegalArgumentException) {
      assertTrue(store.isEmpty())
    }
  }

  private fun entry(): MainnetNativeSignedPayloadStore.Entry {
    val review = MainnetNativeIntentSemanticVerifier.ReviewedTransfer(
      chainId = 56,
      senderAddress = "0x1111111111111111111111111111111111111111",
      recipientAddress = "0x2222222222222222222222222222222222222222",
      asset = MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB,
      assetContract = null,
      amountWei = BigInteger.ONE,
      nonce = BigInteger.ZERO,
      gasLimit = BigInteger("21000"),
      gasPriceWei = BigInteger.ONE,
      observedAtMillis = 10L,
    )
    return MainnetNativeSignedPayloadStore.Entry(
      rawTransaction = "0x01",
      transactionHash = "0x" + "ab".repeat(32),
      review = review,
      reviewDigest = "0x" + "cd".repeat(32),
      authorizationId = "authorization",
      expiresAtMillis = 200L,
    )
  }
}
