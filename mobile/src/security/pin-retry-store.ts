import * as SecureStore from 'expo-secure-store';

import {
  evaluatePinRetryGate,
  isPinRetryRecord,
  MAX_PIN_FAILURES,
  MAX_PIN_RETRY_DELAY_MS,
  type PinRetryGate,
  type PinRetryRecord,
  recordPinFailure,
} from './pin-retry-state';

const RETRY_KEY = 'aurionxi.wallet.pin-retry.v1';
const RETRY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.pin-retry',
  requireAuthentication: false,
};

export class PinRetryStorageError extends Error {
  constructor(message = 'PIN retry security state is unavailable or corrupted.') {
    super(message);
    this.name = 'PinRetryStorageError';
  }
}

export type PinRetryStore = {
  clear: () => Promise<void>;
  getGate: (now?: number) => Promise<PinRetryGate>;
  registerFailure: (now?: number) => Promise<PinRetryGate>;
};

export function createPinRetryStore(
  key: string,
  options: SecureStore.SecureStoreOptions
): PinRetryStore {
  let pendingUpdate: Promise<void> = Promise.resolve();

  async function requireStorage(): Promise<void> {
    if (!(await SecureStore.isAvailableAsync())) throw new PinRetryStorageError();
  }

  async function readRecord(): Promise<PinRetryRecord | null> {
    await requireStorage();
    const stored = await SecureStore.getItemAsync(key, options);
    if (stored === null) return null;
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!isPinRetryRecord(parsed)) throw new PinRetryStorageError();
      return parsed;
    } catch (error) {
      if (error instanceof PinRetryStorageError) throw error;
      throw new PinRetryStorageError();
    }
  }

  async function writeRecord(record: PinRetryRecord): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(record), options);
  }

  async function serializeUpdate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = pendingUpdate;
    let release!: () => void;
    pendingUpdate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  return {
    clear: () =>
      serializeUpdate(async () => {
        await requireStorage();
        await SecureStore.deleteItemAsync(key, options);
      }),
    getGate: (now = Date.now()) =>
      serializeUpdate(async () => {
        const record = await readRecord();
        const gate = evaluatePinRetryGate(record, now);
        if (!gate.allowed && gate.reason === 'clock-rollback') {
          await writeRecord({
            blockedUntil: gate.blockedUntil,
            failedAttempts: MAX_PIN_FAILURES,
            format: 'aurionxi-pin-retry-v1',
            lastAttemptAt: now,
          });
        }
        return gate;
      }),
    registerFailure: (now = Date.now()) =>
      serializeUpdate(async () => {
        const next = recordPinFailure(await readRecord(), now);
        await writeRecord(next);
        return evaluatePinRetryGate(next, now);
      }),
  };
}

const productionRetryStore = createPinRetryStore(RETRY_KEY, RETRY_OPTIONS);

export const getPinRetryGate = productionRetryStore.getGate;
export const registerPinFailure = productionRetryStore.registerFailure;
export const clearPinRetryState = productionRetryStore.clear;
export const PIN_RETRY_MAX_DELAY_MS = MAX_PIN_RETRY_DELAY_MS;
