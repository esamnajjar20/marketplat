import { describe, expect, it } from 'vitest';
import { buildSessionExpiredLoginUrl } from '@/lib/sessionRedirect';

describe('buildSessionExpiredLoginUrl', () => {
  it('preserves a protected page and its query string', () => {
    expect(buildSessionExpiredLoginUrl('/messages/abc', '?tab=unread&page=2')).toBe(
      '/login?from=%2Fmessages%2Fabc%3Ftab%3Dunread%26page%3D2&reason=session_expired',
    );
  });

  it('does not use an auth page as the post-login destination', () => {
    expect(buildSessionExpiredLoginUrl('/login', '?from=%2Fdashboard')).toBe(
      '/login?reason=session_expired',
    );
    expect(buildSessionExpiredLoginUrl('/register')).toBe('/login?reason=session_expired');
  });

  it('falls back to dashboard for malformed or non-local pathnames', () => {
    expect(buildSessionExpiredLoginUrl('//outside.example')).toBe(
      '/login?from=%2Fdashboard&reason=session_expired',
    );
    expect(buildSessionExpiredLoginUrl('/\\\\outside.example')).toBe(
      '/login?from=%2Fdashboard&reason=session_expired',
    );
  });

  it('normalizes a search string with or without a leading question mark', () => {
    expect(buildSessionExpiredLoginUrl('/favorites', 'view=grid')).toBe(
      '/login?from=%2Ffavorites%3Fview%3Dgrid&reason=session_expired',
    );
  });
});
