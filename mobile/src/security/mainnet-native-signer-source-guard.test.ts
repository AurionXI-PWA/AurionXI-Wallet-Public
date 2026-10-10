import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../android/app/src/main/java/com/aurionxi/wallet/mainnet');
const read = (name: string) => readFileSync(resolve(root, name), 'utf8');

const kotlinFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return kotlinFiles(path);
  return entry.isFile() && entry.name.endsWith('.kt') ? [path] : [];
});

/** Remove comments and literals without changing offsets used by call-boundary checks. */
const executableKotlin = (source: string): string => {
  let result = '';
  let index = 0;
  let mode: 'code' | 'line' | 'block' | 'string' | 'triple' | 'char' = 'code';
  while (index < source.length) {
    const current = source[index];
    const pair = source.slice(index, index + 2);
    const triple = source.slice(index, index + 3);
    if (mode === 'code' && pair === '//') { mode = 'line'; result += '  '; index += 2; continue; }
    if (mode === 'code' && pair === '/*') { mode = 'block'; result += '  '; index += 2; continue; }
    if (mode === 'code' && triple === '\"\"\"') { mode = 'triple'; result += '   '; index += 3; continue; }
    if (mode === 'code' && current === '\"') { mode = 'string'; result += ' '; index += 1; continue; }
    if (mode === 'code' && current === "'") { mode = 'char'; result += ' '; index += 1; continue; }
    if (mode === 'line' && current === '\n') { mode = 'code'; result += '\n'; index += 1; continue; }
    if (mode === 'block' && pair === '*/') { mode = 'code'; result += '  '; index += 2; continue; }
    if (mode === 'triple' && triple === '\"\"\"') { mode = 'code'; result += '   '; index += 3; continue; }
    if ((mode === 'string' || mode === 'char') && current === '\\') { result += '  '; index += Math.min(2, source.length - index); continue; }
    if (mode === 'string' && current === '\"') { mode = 'code'; result += ' '; index += 1; continue; }
    if (mode === 'char' && current === "'") { mode = 'code'; result += ' '; index += 1; continue; }
    result += mode === 'code' || current === '\n' ? current : ' ';
    index += 1;
  }
  return result;
};

const matchingParenthesis = (source: string, opening: number): number => {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')' && --depth === 0) return index;
  }
  return -1;
};

describe('native biometric Mainnet signer boundary', () => {
  it('passes the biometric Cipher directly into native vault key use', () => {
    const controller = read('MainnetNativeSigningController.kt');
    const vault = read('MainnetNativeVaultMigration.kt');
    expect(controller).toContain('result.cryptoObject?.cipher');
    expect(controller).toContain('coordinator.signAfterNativeAuthorization');
    expect(vault).toContain('withDerivedCredentials(authenticatedCipher: Cipher');
    const prepareDecrypt = vault.slice(vault.indexOf('fun prepareAuthenticatedVerificationCipher'), vault.indexOf('/** Fresh-biometric verification'));
    expect(prepareDecrypt).not.toContain('updateAAD');
    // One post-authentication AAD application for migration encryption and one
    // for each of the two biometric decrypt consumers.
    expect(vault.match(/authenticatedCipher\.updateAAD\(address\.toByteArray\(StandardCharsets\.UTF_8\)\)/g)).toHaveLength(3);
    expect(vault).toContain('authenticatedCipher.doFinal');
    expect(vault).not.toMatch(/fun <T> withDerivedCredentials\(action:/);
  });

  it('exposes only reviewed public input and signed public output', () => {
    const module = read('AurionXIMainnetSecurityModule.kt');
    const executable = module.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(module).toContain('fun signNativeMainnetTransfer(review: ReadableMap, authorizationEpoch: Double, promise: Promise)');
    expect(executable).not.toMatch(/privateKey|mnemonic|seedPhrase|rpcUrl|broadcastRawTransaction/i);
    expect(module).toContain('"signingReleased" to MainnetNativeSigningReleaseGate.isReleased()');
    expect(read('MainnetNativeSigningController.kt')).not.toContain('putString("rawTransaction"');
    const controller = read('MainnetNativeSigningController.kt');
    expect(controller).toContain('putString("broadcastHandle", handle)');
    expect(controller).toContain('handleIssuer.issue');
    expect(controller).toContain('payloadStore.invalidate(handle)');
    expect(module).toContain('fun broadcastNativeMainnetTransfer(broadcastHandle: String, expectedHash: String, promise: Promise)');
  });

  it('shows exact trusted native details before biometric authorization', () => {
    const controller = read('MainnetNativeSigningController.kt');
    expect(controller).toContain('Confirm exact Mainnet transaction');
    for (const field of ['review.senderAddress', 'review.recipientAddress', 'review.amountWei', 'review.gasLimit', 'review.gasPriceWei']) expect(controller).toContain(field);
    expect(read('MainnetNativeSigningCoordinator.kt')).toContain('"nonce", review.nonce.toString()');
    expect(controller).toContain('Send this Mainnet transfer?');
    expect(controller.indexOf('presentTrustedReview(operation)')).toBeLessThan(controller.indexOf('private fun presentBiometric'));
    expect(controller).toContain('WindowManager.LayoutParams.FLAG_SECURE');
    expect(controller).toContain('mainHandler.postDelayed');
    expect(controller.match(/isFresh\(operation/g)?.length).toBeGreaterThanOrEqual(5);
    expect(controller).toContain('lifecycleGuard.isCurrent(operation.generation)');
    expect(controller).toContain('UUID.randomUUID().toString()');
    expect(controller).toContain('MainnetNativeSigningBoundaryGuard');
    expect(controller).toContain('now < operation.review.observedAtMillis + REVIEW_TTL_MILLIS');
  });

  it('revokes native work on genuine background without confusing the biometric-owned pause', () => {
    const module = read('AurionXIMainnetSecurityModule.kt');
    const guard = read('MainnetNativeLifecycleGuard.kt');
    expect(module).toContain('ProcessLifecycleOwner.get().lifecycle.addObserver(processObserver)');
    expect(module).toContain('override fun onStop(owner: LifecycleOwner) = invalidateNativeOperations()');
    expect(module).toContain('val signingTrustedUi = signingController.isTrustedUiActive()');
    expect(module).toContain('if (!migrationController.isTrustedUiActive())');
    expect(module).toContain('if (!broadcastTrustedUi)');
    expect(module).toContain('!signingTrustedUi && !broadcastTrustedUi');
    expect(module).toContain('broadcastController.cancelForLifecycle()');
    expect(guard).toContain('AtomicLong');
    expect(guard).toContain('generation.incrementAndGet()');
  });

  it('keeps signed bytes in a single-use native handle and pins relay and receipt endpoints', () => {
    const store = read('MainnetNativeSignedPayloadStore.kt');
    const broadcast = read('MainnetNativeBroadcastController.kt');
    expect(store).toContain('entries.remove(handle)');
    expect(store).toContain('expiresAtMillis');
    expect(broadcast).toContain('Broadcast signed Mainnet transaction?');
    expect(broadcast).toContain('X-Firebase-AppCheck');
    expect(broadcast).toContain('walletMainnetBroadcast/v1/bsc-mainnet/broadcast');
    expect(broadcast).toContain('walletMainnetBroadcast/v1/bsc-mainnet/receipt');
    expect(broadcast).toContain('journal.markSubmitted');
    expect(broadcast).toContain('journal.markReceiptVerified');
    expect(broadcast.match(/require\(isCurrent\(operation\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(broadcast).toContain('System.currentTimeMillis() < entry.expiresAtMillis && isCurrent(operation)');
    expect(broadcast).toContain('operation.connection?.disconnect()');
    expect(broadcast).toContain('operation.entry = null');
    expect(broadcast).toContain('finally {');
    expect(broadcast).toContain('localConnection?.disconnect()');
  });

  it('keeps release and one-use authorization checks native', () => {
    const controller = read('MainnetNativeSigningController.kt');
    const coordinator = read('MainnetNativeSigningCoordinator.kt');
    const signer = read('MainnetNativeTransactionSigner.kt');
    expect(controller).toContain('MainnetNativeSigningReleaseGate.requireReleased(review)');
    expect(coordinator).toContain('MainnetNativeSigningReleaseGate.requireReleased(request.review)');
    expect(signer).toContain('MainnetNativeSigningReleaseGate.requireReleased(review)');
    expect(`${coordinator}\n${signer}`).not.toContain('MainnetNativeSigningReleaseGate.requireReleased()');
    expect(controller).toContain('registry.issue');
    expect(controller).toContain('AUTHORIZATION_TTL_MILLIS = 30_000L');
    expect(controller).not.toContain('putString("authorizationId"');
    expect(coordinator).toContain('request.boundaryGuard.requireActive()');
    const finalBoundary = read('MainnetNativeFinalKeyUseBoundary.kt');
    expect(signer).toContain('MainnetNativeFinalKeyUseBoundary.execute');
    expect(signer).toContain('requireActive = boundaryGuard::requireActive');
    expect(signer).toContain('cryptographicUse = { Numeric.toHexString(TransactionEncoder.signMessage');
    expect(finalBoundary).toContain('onSigningStateDurable()\n    requireActive()\n    return cryptographicUse()');
    expect(signer).toContain('markReservedDropped');
    expect(signer).toContain('journal.markSigning');
    expect(signer).toContain('val hash = Hash.sha3(raw)');
    expect(signer).toContain('journal.markSignedUnverified');
    expect(signer.indexOf('journal.markSignedUnverified')).toBeLessThan(signer.indexOf('matchesSignedRaw'));
    const journal = read('MainnetEncryptedNonceJournal.kt');
    expect(journal).toContain('State.SIGNING');
    expect(journal).toContain('State.SIGNED_UNVERIFIED');
    expect(journal).not.toContain('fun dropNeverSubmitted');
    expect(read('MainnetNativeVaultMigration.kt')).toContain('withDerivedCredentials(authenticatedCipher: Cipher, requireActive: () -> Unit');
  });

  it('allows exactly one production signer call and keeps it inside the final boundary', () => {
    const callPattern = /TransactionEncoder\s*\.\s*signMessage\s*\(/g;
    const sources = kotlinFiles(root).map((path) => ({
      file: relative(root, path).replaceAll('\\', '/'),
      source: readFileSync(path, 'utf8'),
    }));
    // Fail closed on additional textual occurrences too: comments and literals
    // cannot conceal a future production call from this uniqueness assertion.
    const rawCalls = sources.flatMap(({ file, source }) => [...source.matchAll(callPattern)].map(() => file));
    expect(rawCalls).toEqual(['MainnetNativeTransactionSigner.kt']);
    const calls = sources.flatMap(({ file, source }) => {
      const executable = executableKotlin(source);
      return [...executable.matchAll(callPattern)].map((match) => ({
        file,
        offset: match.index,
        executable,
      }));
    });
    expect(calls.map(({ file }) => file)).toEqual(['MainnetNativeTransactionSigner.kt']);
    const call = calls[0];
    const boundaryStart = call.executable.lastIndexOf('MainnetNativeFinalKeyUseBoundary.execute', call.offset);
    const opening = call.executable.indexOf('(', boundaryStart);
    const closing = matchingParenthesis(call.executable, opening);
    expect(boundaryStart).toBeGreaterThanOrEqual(0);
    expect(opening).toBeGreaterThan(boundaryStart);
    expect(call.offset).toBeGreaterThan(opening);
    expect(call.offset).toBeLessThan(closing);
  });

  it('binds release natively to an exact expiring proof policy and fee cap', () => {
    const gate = read('MainnetNativeSigningReleaseGate.kt');
    expect(gate).toContain('BuildConfig.CONTROLLED_PROOF_ENABLED');
    for (const field of ['CONTROLLED_PROOF_SENDER', 'CONTROLLED_PROOF_RECIPIENT', 'CONTROLLED_PROOF_ASSET', 'CONTROLLED_PROOF_AMOUNT_WEI', 'CONTROLLED_PROOF_MAX_FEE_WEI', 'CONTROLLED_PROOF_EXPIRES_AT_EPOCH_MS']) expect(gate).toContain(field);
    expect(gate).toContain('review.gasLimit.multiply(review.gasPriceWei)');
    expect(gate).toContain('fee > positive(BuildConfig.CONTROLLED_PROOF_MAX_FEE_WEI)');
  });

  it('keeps the future Direct production path behind an independent native source policy', () => {
    const gate = read('MainnetNativeSigningReleaseGate.kt');
    const policy = read('MainnetNativeDirectProductionPolicy.kt');
    expect(gate).toContain('MainnetNativeDirectProductionPolicy.isReleased()');
    expect(gate).toContain('MainnetNativeDirectProductionPolicy.requireAllowed(review)');
    expect(gate).toContain('proof.xor(production)');
    expect(policy).toContain('BuildConfig.DIRECT_MAINNET_PRODUCTION_ENABLED');
    for (const field of ['DIRECT_MAINNET_MAX_BNB_AMOUNT_WEI', 'DIRECT_MAINNET_MAX_ARXI_AMOUNT_WEI', 'DIRECT_MAINNET_MAX_USDT_AMOUNT_WEI', 'DIRECT_MAINNET_MAX_FEE_WEI']) expect(policy).toContain(field);
    expect(policy).toContain('review.gasLimit.multiply(review.gasPriceWei)');
  });

  it('permits retry only after a terminal never-submitted dropped reservation', () => {
    const journal = read('MainnetEncryptedNonceJournal.kt');
    expect(journal).toContain('if (existing.state != State.DROPPED) return false');
    expect(journal).toContain('update(sender, nonce, State.RESERVED, digest, authorizationId, replacesTransactionHash) { it.copy(state = State.DROPPED) }');
    expect(journal).not.toContain('fun markDropped');
    expect(journal).not.toContain('if (preferences.contains(key)) return false');
  });

  it('exposes old submitted hashes independently of transient JS submission state', () => {
    const module = read('AurionXIMainnetSecurityModule.kt');
    const broadcast = read('MainnetNativeBroadcastController.kt');
    const inspection = broadcast.slice(broadcast.indexOf('fun inspectRecovery('), broadcast.indexOf('fun prepareReplacement('));
    expect(module).toContain('fun getNativeMainnetRecoveryDiagnostics(review: ReadableMap, promise: Promise)');
    expect(inspection).toContain('journal.readRecoveryQueue');
    expect(inspection).toContain('MainnetFixedPreSignSnapshotClient().read(request)');
    expect(inspection).toContain('putString("transactionHash", record.rawTransactionHash)');
    expect(inspection).not.toMatch(/putString\("(?:authorizationId|reviewDigest|rawTransaction|broadcastHandle)"/);
    expect(inspection).not.toMatch(/journal\.mark|signReserved|submit\(/);
    const screen = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-secure-confirm.tsx'), 'utf8');
    expect(screen).toContain('recovery.records.map');
    expect(screen).toContain('canCheckMainnetRecoveryReceipt(record)');
    expect(screen).toContain("if (state === 'confirmed' || state === 'reverted' || state === 'not-submitted' || state === 'cancelled') setRequiresFreshReview(true)");
    expect(screen).toContain('getMainnetRecoveryDiagnosticsNatively');
  });

  it('binds receipt recovery to the recorded hash and bounds App Check waiting', () => {
    const broadcast = read('MainnetNativeBroadcastController.kt');
    const receipt = broadcast.slice(broadcast.indexOf('private fun readReceipt('), broadcast.indexOf('private fun isCurrent('));
    expect(receipt).toContain('MainnetNativeReceiptRecoveryPolicy.verifiedState(hash, response.optString("hash"), response.optString("state"))');
    expect(receipt.indexOf('verifiedState(')).toBeLessThan(receipt.indexOf('journal.markReceiptVerified'));
    expect(receipt).toContain('finally { connection.disconnect() }');
    expect(receipt).toMatch(/if \(state in setOf\("confirmed", "reverted"\)\)\s*\{\s*require\(journal\.markReceiptVerified/);
    expect(receipt).not.toContain('markNeverSubmittedDropped');
    expect(receipt).not.toContain('serializedTransaction');
    expect(broadcast).toContain('mainHandler.postDelayed(timeout, 20_000L)');
    expect(broadcast).toContain('mainHandler.removeCallbacks(timeout)');
  });

  it('settles legacy signed records atomically using receipt evidence without fabricating submission', () => {
    const journal = read('MainnetEncryptedNonceJournal.kt');
    const transition = journal.slice(journal.indexOf('fun markReceiptVerified('), journal.indexOf('private fun update('));
    expect(transition).toContain('synchronized(lock)');
    expect(transition).toContain('if (current != record) return false');
    expect(transition).toContain('MainnetNativeReceiptRecoveryPolicy.terminalRecord(current, responseHash, receiptState)');
    expect(transition.indexOf('terminalRecord(')).toBeLessThan(transition.indexOf('preferences.edit()'));
    expect(transition).toContain('validate(next)');
    expect(transition).not.toMatch(/markSubmitted|attemptCount\s*=|State\.DROPPED|\.remove\(/);
    expect(journal).toContain('if (record.state == State.SUBMITTED) require(record.attemptCount >= 1)');
    const broadcast = read('MainnetNativeBroadcastController.kt');
    const reconcile = broadcast.slice(broadcast.indexOf('fun reconcile('), broadcast.indexOf('private fun acquireTokenThenSubmit('));
    expect(reconcile).toContain('record != null && record.rawTransactionHash?.equals(transactionHash, true)');
    expect(reconcile).toContain('if (record == null)');
    expect(reconcile).toContain('promise.resolve(readReceipt(transactionHash, token, generation, trace))');
    expect(reconcile).toContain('mainnet_native_history_unavailable');
    expect(reconcile).not.toContain('journal.reserve');
    expect(reconcile).not.toContain('journal.mark');
    expect(reconcile).toContain('MainnetNativeReceiptRecoveryPolicy.mayInspect(record.state)');
    expect(reconcile).not.toContain('markSubmitted');
  });

  it('serializes worker custody through signing, consumption, submission and recovery', () => {
    const signer = read('MainnetNativeSigningController.kt');
    const broadcast = read('MainnetNativeBroadcastController.kt');
    const module = read('AurionXIMainnetSecurityModule.kt');
    expect(module).toContain('private val transferOperationGate = MainnetNativeTransferOperationGate()');
    expect(signer).toContain('operationGate.acquire()');
    expect(signer).toContain('if (!operation.workerStarted.get()) operationGate.release(operation.lease)');
    expect(signer).toContain('if (!operation.custodyTransferred) operationGate.release(operation.lease)');
    expect(broadcast).toContain('operationGate.owns(operation.lease)');
    expect(broadcast).toContain('if (operation.submissionBarrier && !operation.requestStarted)');
    expect(broadcast).toContain('MainnetNativeNonSubmissionPolicy.Evidence.BEFORE_NETWORK_IO');
    expect(broadcast).toContain('MainnetNativeNonSubmissionPolicy.Evidence.PINNED_RELAY_REJECTED_BEFORE_RPC');
    expect(broadcast).toContain('if (!operation.workerStarted.get()) operationGate.release(operation.lease)');
    expect(module).toContain('fun sendNativeMainnetTransfer');
    expect(broadcast).toContain('operation.automatic && !entry.sendApproved');
    const screen = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-secure-confirm.tsx'), 'utf8');
    expect(screen).toContain('productionCoordinator.send(');
    expect(screen).not.toContain('broadcastAfterExplicitApproval(');
    expect(screen).not.toContain('signAfterBiometric(');
  });
});
