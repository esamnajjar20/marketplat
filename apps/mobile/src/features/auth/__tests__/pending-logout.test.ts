import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { revokePendingLogout } from '../pending-logout';
import type { PendingLogout } from '../session-storage';

const pending: PendingLogout = {
  accessToken: 'expired-access-token',
  csrfToken: 'stale-csrf-token',
  createdAt: 1_800_000_000_000,
};

function authError(status: number): ApiError {
  return new ApiError('Authentication rejected', status);
}

describe('revokePendingLogout', () => {
  it('revokes immediately when the original access token is still accepted', async () => {
    const logoutSession = vi.fn().mockResolvedValue(undefined);
    const refreshAccessSession = vi.fn();

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).resolves.toBe('revoked');
    expect(logoutSession).toHaveBeenCalledTimes(1);
    expect(logoutSession).toHaveBeenCalledWith('expired-access-token', 'stale-csrf-token');
    expect(refreshAccessSession).not.toHaveBeenCalled();
  });

  it('refreshes and retries logout after the access token expires', async () => {
    const logoutSession = vi.fn()
      .mockRejectedValueOnce(authError(401))
      .mockResolvedValueOnce(undefined);
    const refreshAccessSession = vi.fn().mockResolvedValue({
      accessToken: 'fresh-access-token',
      csrfToken: 'fresh-csrf-token',
    });

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).resolves.toBe('revoked');
    expect(refreshAccessSession).toHaveBeenCalledTimes(1);
    expect(logoutSession).toHaveBeenNthCalledWith(2, 'fresh-access-token', 'fresh-csrf-token');
  });

  it('refreshes after a stale CSRF token and uses the refreshed CSRF value', async () => {
    const logoutSession = vi.fn()
      .mockRejectedValueOnce(authError(403))
      .mockResolvedValueOnce(undefined);
    const refreshAccessSession = vi.fn().mockResolvedValue({
      accessToken: 'fresh-access-token',
      csrfToken: 'rotated-csrf-token',
    });

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).resolves.toBe('revoked');
    expect(logoutSession).toHaveBeenNthCalledWith(2, 'fresh-access-token', 'rotated-csrf-token');
  });

  it('treats a terminal refresh 401 as already expired', async () => {
    const logoutSession = vi.fn().mockRejectedValue(authError(401));
    const refreshAccessSession = vi.fn().mockRejectedValue(authError(401));

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).resolves.toBe('already-expired');
    expect(logoutSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the pending marker unresolved when refresh unexpectedly returns 403', async () => {
    const logoutSession = vi.fn().mockRejectedValue(authError(401));
    const refreshAccessSession = vi.fn().mockRejectedValue(authError(403));

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).rejects.toMatchObject({ status: 403 });
    expect(logoutSession).toHaveBeenCalledTimes(1);
  });

  it('preserves the pending marker on transient logout or refresh failures', async () => {
    const logoutSession = vi.fn().mockRejectedValue(authError(401));
    const refreshAccessSession = vi.fn().mockRejectedValue(new ApiError('Service unavailable', 503));

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).rejects.toMatchObject({ status: 503 });
  });


  it('unregisters the stored FCM token before revoking a deferred session', async () => {
    const order: string[] = [];
    const unregisterFcmToken = vi.fn().mockImplementation(async () => { order.push('push'); });
    const logoutSession = vi.fn().mockImplementation(async () => { order.push('logout'); });
    const refreshAccessSession = vi.fn();
    await expect(revokePendingLogout({ ...pending, fcmToken: 'fcm-token-1' }, { logoutSession, refreshAccessSession, unregisterFcmToken })).resolves.toBe('revoked');
    expect(order).toEqual(['push', 'logout']);
    expect(unregisterFcmToken).toHaveBeenCalledWith('expired-access-token', 'stale-csrf-token', 'fcm-token-1');
  });

  it('refreshes credentials before removing the FCM token if the stored access token expired', async () => {
    const unregisterFcmToken = vi.fn().mockResolvedValue(undefined);
    const logoutSession = vi.fn().mockRejectedValueOnce(authError(401)).mockResolvedValueOnce(undefined);
    const refreshAccessSession = vi.fn().mockResolvedValue({ accessToken: 'fresh-access-token', csrfToken: 'fresh-csrf-token' });
    await expect(revokePendingLogout({ ...pending, fcmToken: 'fcm-token-2' }, { logoutSession, refreshAccessSession, unregisterFcmToken })).resolves.toBe('revoked');
    expect(unregisterFcmToken).toHaveBeenCalledWith('fresh-access-token', 'fresh-csrf-token', 'fcm-token-2');
  });

  it('does not refresh or clear the marker for a non-auth logout failure', async () => {
    const logoutSession = vi.fn().mockRejectedValue(new ApiError('Service unavailable', 503));
    const refreshAccessSession = vi.fn();

    await expect(revokePendingLogout(pending, { logoutSession, refreshAccessSession })).rejects.toMatchObject({ status: 503 });
    expect(refreshAccessSession).not.toHaveBeenCalled();
  });
});
