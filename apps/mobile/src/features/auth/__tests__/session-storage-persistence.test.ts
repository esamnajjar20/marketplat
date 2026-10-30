import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);

import { clearPersistedSession, writePersistedSession, type PersistedSession } from '../session-storage';

const session: PersistedSession = {
  accessToken: 'test-token',
  csrfToken: null,
  expiresAt: Date.now() + 60_000,
  user: { id: 'user-1', email: 'test@example.test', name: 'Tester' },
};

beforeEach(() => {
  secureStore.setItemAsync.mockReset();
  secureStore.deleteItemAsync.mockReset();
  secureStore.setItemAsync.mockResolvedValue(undefined);
  secureStore.deleteItemAsync.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('secure session persistence outcomes', () => {
  it('returns true after a successful save', async () => {
    await expect(writePersistedSession(session)).resolves.toBe(true);
  });

  it('returns false when SecureStore rejects a save', async () => {
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('secure storage unavailable'));
    await expect(writePersistedSession(session)).resolves.toBe(false);
  });

  it('returns false when SecureStore fails to delete a saved session', async () => {
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('secure storage unavailable'));
    await expect(clearPersistedSession()).resolves.toBe(false);
  });
});
