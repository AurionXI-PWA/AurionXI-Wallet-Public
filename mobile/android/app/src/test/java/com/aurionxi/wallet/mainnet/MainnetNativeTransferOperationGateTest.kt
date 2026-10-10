package com.aurionxi.wallet.mainnet

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.math.BigInteger

class MainnetNativeTransferOperationGateTest {
  @Test fun `cancelled custody remains exclusive until its worker releases`() {
    val gate = MainnetNativeTransferOperationGate()
    val lease = gate.acquire()!!
    assertNull(gate.acquire()) // settling a promise is deliberately not a release
    gate.release(lease)
    val next = gate.acquire()!!
    gate.release(lease) // a stale completion must not release the new owner
    assertTrue(gate.owns(next))
  }
  @Test fun `overlapping signing broadcast and recovery have exactly one owner`() {
    val gate = MainnetNativeTransferOperationGate()
    val start = CountDownLatch(1)
    val pool = Executors.newFixedThreadPool(3)
    try {
      val futures = (1..3).map { pool.submit<MainnetNativeTransferOperationGate.Lease?> { start.await(); gate.acquire() } }
      start.countDown()
      val leases = futures.map { it.get(5, TimeUnit.SECONDS) }.filterNotNull()
      assertEquals(1, leases.size)
      gate.release(leases.single())
      assertNotNull(gate.acquire())
    } finally { pool.shutdownNow() }
  }
  @Test fun `consumed bytes stay in exclusive worker custody after cancellation until cleanup`() {
    val gate = MainnetNativeTransferOperationGate()
    val store = MainnetNativeSignedPayloadStore()
    val lease = gate.acquire()!!
    val hash = "0x" + "a".repeat(64)
    val review = MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56, "0x" + "1".repeat(40), "0x" + "2".repeat(40),
      MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB, null, BigInteger.ONE, BigInteger.ONE, BigInteger.valueOf(21000), BigInteger.ONE, 1)
    val handle = store.issue(MainnetNativeSignedPayloadStore.Entry("0x01", hash, review, "0x" + "b".repeat(64), "test", 1000, true), 1)
    val consumed = CountDownLatch(1)
    val finish = CountDownLatch(1)
    val pool = Executors.newSingleThreadExecutor()
    try {
      val worker = pool.submit {
        var local: MainnetNativeSignedPayloadStore.Entry? = store.consume(handle, hash, 2)
        try {
          assertNotNull(local); consumed.countDown()
          assertTrue(finish.await(5, TimeUnit.SECONDS))
          assertTrue(gate.owns(lease))
        } finally { local = null; gate.release(lease) }
      }
      assertTrue(consumed.await(5, TimeUnit.SECONDS))
      store.invalidateAll() // cancellation cannot revoke a worker's already-consumed reference
      assertNull(store.consume(handle, hash, 3))
      assertNull(gate.acquire()) // neither recovery nor a second signer may run yet
      finish.countDown(); worker.get(5, TimeUnit.SECONDS)
      val recoveryLease = gate.acquire()!!
      assertTrue(store.isEmpty())
      gate.release(recoveryLease)
      // New process-local stores cannot restore old handles after restart.
      assertNull(MainnetNativeSignedPayloadStore().consume(handle, hash, 4))
    } finally { finish.countDown(); pool.shutdownNow() }
  }
}
