import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getAnalyticsConsent, hasAnalyticsConsent, setAnalyticsConsent } from '@/lib/analyticsConsent';

describe('analytics consent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to no consent', () => {
    expect(getAnalyticsConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('persists an explicit grant', () => {
    setAnalyticsConsent('granted');
    expect(getAnalyticsConsent()).toBe('granted');
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('persists an explicit denial', () => {
    setAnalyticsConsent('denied');
    expect(getAnalyticsConsent()).toBe('denied');
    expect(hasAnalyticsConsent()).toBe(false);
  });
});
