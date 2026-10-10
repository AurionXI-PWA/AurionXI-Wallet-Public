const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export type Freshness = {
  label: string;
  isStale: boolean;
};

export function getBlockFreshness(blockTime: Date, now = new Date()): Freshness {
  const ageMs = Math.max(0, now.getTime() - blockTime.getTime());
  const seconds = Math.floor(ageMs / SECOND);

  if (ageMs < MINUTE) {
    return {
      label: seconds < 5 ? 'Just now' : `${seconds}s ago`,
      isStale: false,
    };
  }

  const minutes = Math.floor(ageMs / MINUTE);
  return {
    label: `${minutes}m ago`,
    isStale: minutes >= 2,
  };
}
