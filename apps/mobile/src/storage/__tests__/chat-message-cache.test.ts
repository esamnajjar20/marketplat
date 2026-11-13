import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  execAsync: vi.fn(async () => undefined),
  runAsync: vi.fn(async () => undefined),
  withExclusiveTransactionAsync: vi.fn(async (fn: (txn: { runAsync: typeof db.runAsync }) => Promise<void>) => fn({ runAsync: db.runAsync })),
}));
vi.mock('expo-sqlite', () => ({}));
vi.mock('@/storage/encrypted-database', () => ({ openEncryptedDatabaseAsync: vi.fn(async () => db) }));

import { persistCachedChatMessages, saveCachedChatMessages } from '../chat-message-cache';

const message = { id: 'm1', conversationId: 'c1', senderId: 'u1', createdAt: '2026-01-01T00:00:00.000Z' } as never;

beforeEach(() => {
  db.runAsync.mockClear();
  db.withExclusiveTransactionAsync.mockClear();
});

describe('chat message cache write contract', () => {
  it('reports saved on success', async () => {
    expect(await persistCachedChatMessages('u1', 'c1', [message])).toBe('saved');
    expect(db.runAsync).toHaveBeenCalled();
  });

  it('reports skipped when nothing is storable (no DB write)', async () => {
    expect(await persistCachedChatMessages('u1', 'c1', [{ id: '' } as never])).toBe('skipped');
    expect(await persistCachedChatMessages('', 'c1', [message])).toBe('skipped');
    expect(db.withExclusiveTransactionAsync).not.toHaveBeenCalled();
  });

  it('reports failed (not a silent success) when the SQLite write throws', async () => {
    db.withExclusiveTransactionAsync.mockRejectedValueOnce(new Error('database is locked'));
    expect(await persistCachedChatMessages('u1', 'c1', [message])).toBe('failed');
  });

  it('best-effort saveCachedChatMessages still never throws, even when the write fails', async () => {
    db.withExclusiveTransactionAsync.mockRejectedValueOnce(new Error('database is locked'));
    await expect(saveCachedChatMessages('u1', 'c1', [message])).resolves.toBeUndefined();
  });
});
