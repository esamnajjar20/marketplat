import { describe, expect, it } from 'vitest';
import { isPublicFeatureFlagEnabled } from '@/lib/publicFeatureFlags';

describe('public feature flag rollout', () => {
  it('keeps disabled and zero-percent flags off', () => {
    expect(isPublicFeatureFlagEnabled('PUBLIC_X', { enabled: false, rolloutPercent: 100 }, 'user-1')).toBe(false);
    expect(isPublicFeatureFlagEnabled('PUBLIC_X', { enabled: true, rolloutPercent: 0 }, 'user-1')).toBe(false);
  });

  it('enables 100-percent flags even without a subject', () => {
    expect(isPublicFeatureFlagEnabled('PUBLIC_X', { enabled: true, rolloutPercent: 100 })).toBe(true);
  });

  it('uses a stable user cohort and fails closed without a subject for partial rollout', () => {
    const flag = { enabled: true, rolloutPercent: 50 };
    const first = isPublicFeatureFlagEnabled('PUBLIC_X', flag, 'user-123');
    expect(isPublicFeatureFlagEnabled('PUBLIC_X', flag, 'user-123')).toBe(first);
    expect(isPublicFeatureFlagEnabled('PUBLIC_X', flag)).toBe(false);
  });
});
