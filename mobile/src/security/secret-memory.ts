export function zeroizeBytes(value: Uint8Array | undefined): void {
  value?.fill(0);
}

export async function withZeroizedBytes<T>(
  acquire: () => Promise<Uint8Array>,
  consume: (value: Uint8Array) => Promise<T> | T,
): Promise<T> {
  let value: Uint8Array | undefined;
  try {
    value = await acquire();
    return await consume(value);
  } finally {
    zeroizeBytes(value);
  }
}
