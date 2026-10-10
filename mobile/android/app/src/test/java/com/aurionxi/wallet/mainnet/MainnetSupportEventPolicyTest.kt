package com.aurionxi.wallet.mainnet

import org.junit.Assert.*
import org.junit.Test

class MainnetSupportEventPolicyTest {
  @Test fun `only public diagnostic fields cross the storage and export boundary`() {
    val hash = "0x" + "a".repeat(64)
    val public = mapOf("sender" to "0x" + "1".repeat(40), "hash" to hash, "originalHash" to hash, "nonce" to "6",
      "recordNonce" to "5", "journalState" to "SUBMITTED", "attemptCount" to "1", "httpStatus" to "200",
      "outcome" to "unknown", "reason" to "receipt_and_transaction_not_found", "errorCode" to "mainnet_native_replacement_receipt",
      "clockDeltaMs" to "-191", "lifecycleCurrent" to "true")
    val dirty = public + mapOf("privateKey" to "secret", "pin" to "123456", "rawTransaction" to "secret", "serializedTransaction" to "secret",
      "authorizationId" to "secret", "reviewDigest" to "secret", "broadcastHandle" to "secret", "appCheckToken" to "secret", "errorMessage" to "secret")
    assertEquals(public, MainnetSupportEventPolicy.clean(dirty))
    assertEquals(public, MainnetSupportEventPolicy.clean(MainnetSupportEventPolicy.clean(dirty)))
  }
  @Test fun `malformed or unbounded values cannot become exported metadata`() {
    assertTrue(MainnetSupportEventPolicy.clean(mapOf("hash" to "0x1234", "nonce" to "-1", "pendingNonce" to "6.5", "recipient" to "secret",
      "errorCode" to "secretvalue", "errorType" to "Exception with credential", "clockDeltaMs" to "1".repeat(100),
      "httpStatus" to "999", "reason" to "https://example.com/?token=secret", "stage" to "a".repeat(500), "hasTransferDetails" to "yes")).isEmpty())
  }
}
