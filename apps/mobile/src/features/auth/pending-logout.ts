import { ApiError, apiRequest } from '@/api/client';
import { clearRegisteredAndroidPushState } from '@/features/notifications/native-push';
import type { PendingLogout } from './session-storage';
import { logoutSession, refreshAccessSession } from './auth.api';

type LogoutOperations = {
  logoutSession: (accessToken: string, csrfToken?: string) => Promise<void>;
  refreshAccessSession: () => Promise<{ accessToken: string; csrfToken?: string }>;
  unregisterFcmToken?: (accessToken: string, csrfToken: string | null | undefined, fcmToken: string) => Promise<void>;
};

export type PendingLogoutOutcome = 'revoked' | 'already-expired';

function isLogoutAuthRejection(error: unknown): error is ApiError {
  // A stale access token or stale CSRF pair can reject logout. Refresh once in
  // either case, then retry with the newly issued access/CSRF pair.
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function isTerminalRefreshRejection(error: unknown): error is ApiError {
  // The refresh endpoint's contract returns 401 for an invalid/revoked/expired
  // refresh token. A 403 is not documented as terminal and must keep the marker.
  return error instanceof ApiError && error.status === 401;
}

/**
 * Confirms a write-ahead logout marker. An expired access token is not proof that
 * the session is gone: refresh the still-cookie-backed session and retry revocation.
 * A rejected refresh cookie is terminal because the server clears that cookie on
 * refresh failure; transient/network failures must keep the marker for another retry.
 */
async function unregisterFcmToken(
  accessToken: string,
  csrfToken: string | null | undefined,
  fcmToken: string,
): Promise<void> {
  await apiRequest('/api/v1/notifications/fcm-tokens', {
    method: 'DELETE',
    token: accessToken,
    ...(csrfToken ? { headers: { 'X-CSRF-Token': csrfToken } } : {}),
    body: JSON.stringify({ token: fcmToken }),
  });
  await clearRegisteredAndroidPushState();
}

export async function revokePendingLogout(
  pending: PendingLogout,
  operations: LogoutOperations = { logoutSession, refreshAccessSession, unregisterFcmToken },
): Promise<PendingLogoutOutcome> {
  const removePushToken = operations.unregisterFcmToken ?? unregisterFcmToken;
  try {
    if (pending.fcmToken) await removePushToken(pending.accessToken, pending.csrfToken, pending.fcmToken);
    await operations.logoutSession(pending.accessToken, pending.csrfToken ?? undefined);
    return 'revoked';
  } catch (error) {
    if (!isLogoutAuthRejection(error)) throw error;
  }

  let refreshed: { accessToken: string; csrfToken?: string };
  try {
    refreshed = await operations.refreshAccessSession();
  } catch (error) {
    if (isTerminalRefreshRejection(error)) {
      // The refresh cookie is terminally rejected; clear this device's local
      // opt-in marker so a later account cannot inherit the old subscription.
      if (pending.fcmToken) await clearRegisteredAndroidPushState();
      return 'already-expired';
    }
    throw error;
  }

  // Refresh also rotates the CSRF cookie; use its matching token rather than a stale
  // value from the write-ahead marker. Remove the push token before revoking the session.
  if (pending.fcmToken) await removePushToken(refreshed.accessToken, refreshed.csrfToken, pending.fcmToken);
  await operations.logoutSession(refreshed.accessToken, refreshed.csrfToken);
  return 'revoked';
}
