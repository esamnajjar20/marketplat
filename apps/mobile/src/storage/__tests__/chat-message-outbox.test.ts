import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = vi.hoisted(async () => {
  const { createSqliteMock } = await import('./helpers/sqlite-mock');
  return createSqliteMock();
});

vi.mock('expo-sqlite', async () => await mock);
vi.mock('@/storage/encrypted-database', async () => ({
  openEncryptedDatabaseAsync: async () => (await mock).openDatabaseAsync('marketplat-private-v2.db'),
}));

import {
  enqueueChatMessage, listChatMessagesForOwner, listDueChatMessages,
  acknowledgeChatMessage, deferChatMessage, retryChatMessage,
  discardRejectedChatMessage, discardFailedChatMessage, CHAT_OUTBOX_MAX_ATTEMPTS,
} from '@/storage/chat-message-outbox';

const OWNER = 'user-1';
const CONV = 'conv-1';
let counter = 0;
const opId = () => { counter += 1; return `op-${Date.now()}-${counter}`; };

describe('chat-message-outbox', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('rejects empty ownerId', async () => {
    await expect(enqueueChatMessage({ ownerId: '', conversationId: CONV, body: 'hi', operationId: opId() }))
      .rejects.toThrow(/الحساب والمحادثة/);
  });

  it('rejects empty conversationId', async () => {
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: '', body: 'hi', operationId: opId() }))
      .rejects.toThrow(/الحساب والمحادثة/);
  });

  it('rejects empty body', async () => {
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: '   ', operationId: opId() }))
      .rejects.toThrow(/فارغ|الحد/);
  });

  it('rejects body > 2000 chars', async () => {
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'a'.repeat(2001), operationId: opId() }))
      .rejects.toThrow(/فارغ|الحد/);
  });

  it('rejects invalid operationId (leading non-alnum)', async () => {
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'hi', operationId: '!bad' }))
      .rejects.toThrow(/معرّف/);
  });

  it('rejects invalid operationId (too long)', async () => {
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'hi', operationId: 'a'.repeat(129) }))
      .rejects.toThrow(/معرّف/);
  });

  it('deduplicates by operationId with identical values', async () => {
    const id = opId();
    const a = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'hello', operationId: id });
    const b = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'hello', operationId: id });
    expect(a.id).toBe(b.id);
    expect(await listChatMessagesForOwner(OWNER)).toHaveLength(1);
  });

  it('throws when operationId reused with different values', async () => {
    const id = opId();
    await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'first', operationId: id });
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'second', operationId: id }))
      .rejects.toThrow(/مستخدم لرسالة مختلفة/);
  });

  it('rejects enqueue when queue has 50 pending', async () => {
    for (let i = 0; i < 50; i += 1) {
      await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: `msg ${i}`, operationId: opId() });
    }
    await expect(enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'overflow', operationId: opId() }))
      .rejects.toThrow(/ممتلئ/);
  });

  it('listDue excludes attempts >= MAX_ATTEMPTS (Phase 2 fix)', async () => {
    const exhausted = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'exhausted', operationId: opId() });
    const ready = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'ready', operationId: opId() });
    const m = await mock;
    const raw = m.getRawDb('marketplat-private-v2.db')!;
    raw.prepare('UPDATE chat_message_outbox SET attempts = ?, next_attempt_at = 0 WHERE id = ?').run(CHAT_OUTBOX_MAX_ATTEMPTS, exhausted.id);
    const due = await listDueChatMessages(OWNER, Date.now());
    expect(due.map((x) => x.id)).toEqual([ready.id]);
  });

  it('listDue excludes next_attempt_at in future', async () => {
    const future = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'future', operationId: opId() });
    const m = await mock;
    const raw = m.getRawDb('marketplat-private-v2.db')!;
    raw.prepare('UPDATE chat_message_outbox SET next_attempt_at = ? WHERE id = ?').run(Date.now() + 60_000, future.id);
    expect(await listDueChatMessages(OWNER, Date.now())).toHaveLength(0);
  });

  it('defer increments attempts + sets next_attempt_at', async () => {
    const msg = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'x', operationId: opId() });
    const before = Date.now();
    await deferChatMessage(msg.operationId, OWNER, new Error('network'));
    const after = Date.now();
    const items = await listChatMessagesForOwner(OWNER);
    const u = items.find((x) => x.id === msg.id)!;
    expect(u.attempts).toBe(1);
    expect(u.nextAttemptAt).toBeGreaterThanOrEqual(before + 5_000);
    expect(u.nextAttemptAt).toBeLessThanOrEqual(after + 5_100);
    expect(u.lastError).toContain('network');
  });

  it('retry only resets exhausted (>=8)', async () => {
    const msg = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'x', operationId: opId() });
    expect(await retryChatMessage(msg.operationId, OWNER)).toBe(false);
    const m = await mock;
    const raw = m.getRawDb('marketplat-private-v2.db')!;
    raw.prepare('UPDATE chat_message_outbox SET attempts = ? WHERE id = ?').run(CHAT_OUTBOX_MAX_ATTEMPTS, msg.id);
    expect(await retryChatMessage(msg.operationId, OWNER)).toBe(true);
  });

  it('discardRejectedChatMessage works regardless of attempts (Phase 2 fix)', async () => {
    const msg = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'x', operationId: opId() });
    expect(await discardRejectedChatMessage(msg.operationId, OWNER)).toBe(true);
    expect(await listChatMessagesForOwner(OWNER)).toHaveLength(0);
  });

  it('discardFailedChatMessage refuses non-exhausted', async () => {
    const msg = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'x', operationId: opId() });
    expect(await discardFailedChatMessage(msg.operationId, OWNER)).toBe(false);
    expect(await listChatMessagesForOwner(OWNER)).toHaveLength(1);
  });

  it('acknowledge scoped to owner', async () => {
    const msg = await enqueueChatMessage({ ownerId: OWNER, conversationId: CONV, body: 'x', operationId: opId() });
    expect(await acknowledgeChatMessage(msg.operationId, 'other-user')).toBe(false);
    expect(await acknowledgeChatMessage(msg.operationId, OWNER)).toBe(true);
    expect(await listChatMessagesForOwner(OWNER)).toHaveLength(0);
  });
});
