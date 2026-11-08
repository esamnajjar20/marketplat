import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  acknowledgeChatMessage: vi.fn(),
  deferChatMessage: vi.fn(),
  discardRejectedChatMessage: vi.fn(),
  listChatMessagesForOwner: vi.fn(),
  listDueChatMessages: vi.fn(),
  appState: 'active' as string,
}));

vi.mock('react-native', () => ({ AppState: { get currentState() { return mocks.appState; } } }));
vi.mock('@/api/client', () => ({ ApiError: class ApiError extends Error { constructor(message: string, public status?: number) { super(message); } } }));
vi.mock('../messaging.api', () => ({ sendMessage: mocks.sendMessage }));
vi.mock('@/storage/chat-message-outbox', () => ({
  acknowledgeChatMessage: mocks.acknowledgeChatMessage,
  deferChatMessage: mocks.deferChatMessage,
  discardRejectedChatMessage: mocks.discardRejectedChatMessage,
  listChatMessagesForOwner: mocks.listChatMessagesForOwner,
  listDueChatMessages: mocks.listDueChatMessages,
}));

import { ApiError } from '@/api/client';
import { syncChatMessageOutbox } from '../chat-message-outbox-sync';

const SNAP = { isOnline: true, token: 'access-token', csrfToken: 'csrf', ownerId: 'owner-1' };
const ITEM = { id: 'row-1', ownerId: 'owner-1', conversationId: 'conv-1', body: 'مرحبا', operationId: 'op-1' };
const MESSAGE = { id: 'message-1', conversationId: 'conv-1', senderId: 'owner-1', body: 'مرحبا', createdAt: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appState = 'active';
  mocks.listDueChatMessages.mockResolvedValue([ITEM]);
  mocks.listChatMessagesForOwner.mockResolvedValue([]);
  mocks.acknowledgeChatMessage.mockResolvedValue(true);
  mocks.deferChatMessage.mockResolvedValue(undefined);
  mocks.discardRejectedChatMessage.mockResolvedValue(true);
  mocks.sendMessage.mockResolvedValue(MESSAGE);
});

describe('chat message outbox sync', () => {
  it('does not read or send queued messages while offline', async () => {
    const result = await syncChatMessageOutbox({ ...SNAP, isOnline: false });
    expect(result.stoppedReason).toBe('offline');
    expect(mocks.listDueChatMessages).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send when token or owner is missing', async () => {
    const result = await syncChatMessageOutbox({ ...SNAP, token: null });
    expect(result.stoppedReason).toBe('signed-out');
    expect(mocks.listDueChatMessages).not.toHaveBeenCalled();
  });

  it('sends with idempotency operation id and acknowledges only after success', async () => {
    const listener = vi.fn();
    const { subscribeChatOutboxSent } = await import('../chat-message-outbox-sync');
    const unsubscribe = subscribeChatOutboxSent(listener);
    const result = await syncChatMessageOutbox(SNAP);
    unsubscribe();

    expect(mocks.listDueChatMessages).toHaveBeenCalledWith('owner-1');
    expect(mocks.sendMessage).toHaveBeenCalledWith('conv-1', 'مرحبا', 'access-token', 'csrf', 'op-1', undefined);
    expect(mocks.acknowledgeChatMessage).toHaveBeenCalledWith('op-1', 'owner-1');
    expect(mocks.deferChatMessage).not.toHaveBeenCalled();
    expect(result.sent).toEqual([{ operationId: 'op-1', message: MESSAGE }]);
    expect(listener).toHaveBeenCalledWith('op-1', MESSAGE);
  });

  it.each([400, 404, 422])('discards permanent server rejection %s without retrying', async (status) => {
    mocks.sendMessage.mockRejectedValueOnce(new ApiError('rejected', status));
    mocks.listChatMessagesForOwner.mockResolvedValueOnce([ITEM]);
    const result = await syncChatMessageOutbox(SNAP);
    expect(mocks.discardRejectedChatMessage).toHaveBeenCalledWith('op-1', 'owner-1');
    expect(mocks.deferChatMessage).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe('rejected');
    expect(result.pending).toBe(1);
  });

  it.each([401, 403])('preserves queued message and stops on authorization response %s', async (status) => {
    mocks.sendMessage.mockRejectedValueOnce(new ApiError('not allowed', status));
    mocks.listChatMessagesForOwner.mockResolvedValueOnce([ITEM]);
    const result = await syncChatMessageOutbox(SNAP);
    expect(mocks.deferChatMessage).toHaveBeenCalledWith('op-1', 'owner-1', expect.any(ApiError));
    expect(mocks.discardRejectedChatMessage).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe('signed-out');
    expect(result.pending).toBe(1);
  });

  it('schedules retry for transient errors and stops the current drain', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('network unavailable'));
    mocks.listChatMessagesForOwner.mockResolvedValueOnce([ITEM]);
    const result = await syncChatMessageOutbox(SNAP);
    expect(mocks.deferChatMessage).toHaveBeenCalledWith('op-1', 'owner-1', expect.any(Error));
    expect(result.stoppedReason).toBe('retry-scheduled');
  });

  it('does not send after the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await syncChatMessageOutbox({ ...SNAP, signal: controller.signal });
    expect(result.stoppedReason).toBe('signed-out');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
