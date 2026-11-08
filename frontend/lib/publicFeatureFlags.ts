export type PublicFeatureFlag = {
  enabled: boolean;
  rolloutPercent: number;
};

/** Stable 0..99 cohort bucket. It is deterministic, not a security primitive. */
function rolloutBucket(flagName: string, subject: string): number {
  const input = `${flagName}:${subject}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function isPublicFeatureFlagEnabled(flagName: string, flag: PublicFeatureFlag, subject?: string | null): boolean {
  if (!flag.enabled || flag.rolloutPercent <= 0) return false;
  if (flag.rolloutPercent >= 100) return true;
  if (!subject || !subject.trim()) return false;
  return rolloutBucket(flagName, subject) < flag.rolloutPercent;
}
