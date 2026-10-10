package com.aurionxi.wallet.mainnet

import java.util.UUID

/** Custody lock shared by signing, broadcast and recovery, not just their UI promises.
 * Cancellation must retain its lease until the worker has discarded its local payload.
 */
internal class MainnetNativeTransferOperationGate {
  data class Lease internal constructor(val id: String)
  private var owner: Lease? = null
  @Synchronized fun acquire(): Lease? {
    if (owner != null) return null
    return Lease(UUID.randomUUID().toString()).also { owner = it }
  }
  @Synchronized fun owns(lease: Lease): Boolean = owner === lease
  @Synchronized fun release(lease: Lease) { if (owner === lease) owner = null }
}
