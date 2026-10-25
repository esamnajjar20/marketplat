import { describe, expect, it } from 'vitest';
import { resolveErrorReporterUrl } from '@/lib/errorReporterUrl';
import { API_BASE_URL } from '@/lib/constants';

describe('resolveErrorReporterUrl', () => {
  it('returns undefined when unset or blank (console-only reporting)', () => {
    expect(resolveErrorReporterUrl(undefined)).toBeUndefined();
    expect(resolveErrorReporterUrl('   ')).toBeUndefined();
  });

  it('keeps a configured non-legacy endpoint untouched', () => {
    expect(resolveErrorReporterUrl('https://errors.example.com/ingest')).toBe(
      'https://errors.example.com/ingest',
    );
  });

  // REGRESSION (FIX ERROR-REPORTER-URL-01): a stale env var pointing at the old
  // Render backend made every report fail with "TypeError: Failed to fetch".
  it('maps a legacy *.onrender.com reporter URL to the live API origin', () => {
    expect(
      resolveErrorReporterUrl('https://marketplat-nz19.onrender.com/api/v1/observability/client-error'),
    ).toBe(`${API_BASE_URL.replace(/\/+$/, '')}/observability/client-error`);
  });
});
