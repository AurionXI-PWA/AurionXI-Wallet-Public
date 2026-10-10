export const ARGON2_POLICY = Object.freeze({
  algorithm: 'argon2id',
  hashLengthBytes: 32,
  iterations: 2,
  memoryKiB: 19_456,
  parallelism: 1,
  saltBytes: 16,
} as const);

export function isDerivedPinKey(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}
