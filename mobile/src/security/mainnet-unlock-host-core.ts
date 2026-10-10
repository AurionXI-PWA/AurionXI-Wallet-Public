/** Wait for the previous Android prompt to detach, but never start after retirement. */
export async function waitForMainnetUnlockHost(
  readReady: () => Promise<boolean>,
  isCurrent: () => boolean,
  now: () => number = Date.now,
  pause: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 80)),
): Promise<void> {
  const deadline = now() + 2_000;
  while (isCurrent() && now() < deadline) {
    const ready = await readReady();
    if (!isCurrent()) break;
    if (ready && now() < deadline) return;
    await pause();
  }
  throw new Error('The wallet authentication screen is not resumed or the unlock attempt was cancelled.');
}
