package com.aurionxi.wallet.mainnet

import java.util.concurrent.atomic.AtomicLong

/** Monotonic native capability epoch. Any lifecycle invalidation revokes all older work. */
internal class MainnetNativeLifecycleGuard {
  private val generation = AtomicLong(1L)
  fun capture(): Long = generation.get()
  fun isCurrent(captured: Long): Boolean = captured == generation.get()
  fun invalidate(): Long = generation.incrementAndGet()
}
