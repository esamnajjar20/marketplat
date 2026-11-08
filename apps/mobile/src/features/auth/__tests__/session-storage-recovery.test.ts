import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => secureStore);

import {
  PENDING_LOGOUT_KEY,
  SECURE_SESSION_KEY,
  clearPendingLogout,
  readPendingLogout,
  readPersistedSession,
  writePendingLogout,
} from '../session-storage';

const session = {
  accessToken: 'access-token',
  csrfToken: 'csrf-token',
  expiresAt: Date.now() + 60_000,
  user: { id: 'u1', email: 'u@example.test', name: 'User', role: 'USER' },
};
const pendingLogout = { accessToken: 'revocation-token', csrfToken: 'csrf', createdAt: Date.now(), fcmToken: 'fcm-token' };

beforeEach(() => {
  vi.clearAllMocks();
  secureStore.getItemAsync.mockResolvedValue(null);
  secureStore.setItemAsync.mockResolvedValue(undefined);
  secureStore.deleteItemAsync.mockResolvedValue(undefined);
});

describe('session recovery and pending logout persistence', () => {
  it('reads a valid persisted session without changing its account identity', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(session));
    await expect(readPersistedSession()).resolves.toEqual(session);
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(SECURE_SESSION_KEY);
  });

  it('removes malformed persisted session data instead of restoring it', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ accessToken: '', user: {} }));
    await expect(readPersistedSession()).resolves.toBeNull();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_SESSION_KEY);
  });

  it('fails closed to no cached session when SecureStore read fails', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('keystore locked'));
    await expect(readPersistedSession()).resolves.toBeNull();
  });

  it('persists pending logout marker and reads it back for revocation', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(pendingLogout));
    await expect(writePendingLogout(pendingLogout)).resolves.toBe(true);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(PENDING_LOGOUT_KEY, JSON.stringify(pendingLogout));
    await expect(readPendingLogout()).resolves.toEqual(pendingLogout);
  });

  it('rejects malformed pending logout marker rather than allowing session restore', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ accessToken: '', createdAt: 'yesterday', csrfToken: 3 }));
    await expect(readPendingLogout()).rejects.toThrow(/تعذرت قراءة حالة تسجيل الخروج المؤجل/);
  });

  it('rejects an oversized or invalid FCM token in pending logout marker', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...pendingLogout, fcmToken: 'x'.repeat(501) }));
    await expect(readPendingLogout()).rejects.toThrow(/تعذرت قراءة حالة تسجيل الخروج المؤجل/);
  });

  it('does not claim pending logout was cleared when SecureStore delete fails', async () => {
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('keystore locked'));
    await expect(clearPendingLogout()).resolves.toBe(false);
  });
});
