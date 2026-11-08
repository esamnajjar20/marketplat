import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendChatImage: vi.fn(),
  sendChatAudio: vi.fn(),
  sendChatFile: vi.fn(),
  acknowledgeChatMedia: vi.fn(),
  deferChatMedia: vi.fn(),
  discardRejectedChatMedia: vi.fn(),
  listChatMediaOutbox: vi.fn(),
  listDueChatMediaOutbox: vi.fn(),
  appState: 'active' as string,
}));
vi.mock('react-native', () => ({ AppState: { get currentState() { return mocks.appState; } } }));
vi.mock('@/api/client', () => ({ ApiError: class ApiError extends Error { constructor(message: string, public status?: number) { super(message); } } }));
vi.mock('../messaging.api', () => ({
  sendChatImage: mocks.sendChatImage,
  sendChatAudio: mocks.sendChatAudio,
  sendChatFile: mocks.sendChatFile,
}));
vi.mock('@/storage/chat-media-outbox', () => ({
  acknowledgeChatMedia: mocks.acknowledgeChatMedia,
  deferChatMedia: mocks.deferChatMedia,
  discardRejectedChatMedia: mocks.discardRejectedChatMedia,
  listChatMediaOutbox: mocks.listChatMediaOutbox,
  listDueChatMediaOutbox: mocks.listDueChatMediaOutbox,
}));

import { ApiError } from '@/api/client';
import { syncChatMediaOutbox } from '../chat-media-outbox-sync';

const SNAP = { isOnline: true, token: 'token', csrfToken: 'csrf', ownerId: 'user-1' };
const item = { id: 'media-1', ownerId: 'user-1', conversationId: 'conv-1', operationId: 'media-op-1', kind: 'image' as const, uri: 'file:///image.jpg', fileName: 'image.jpg', mimeType: 'image/jpeg' };
const message = { id: 'm1', conversationId: 'conv-1', senderId: 'user-1', createdAt: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appState = 'active';
  mocks.listDueChatMediaOutbox.mockResolvedValue([item]);
  mocks.listChatMediaOutbox.mockResolvedValue([]);
  mocks.acknowledgeChatMedia.mockResolvedValue(true);
  mocks.deferChatMedia.mockResolvedValue(undefined);
  mocks.discardRejectedChatMedia.mockResolvedValue(true);
  mocks.sendChatImage.mockResolvedValue(message);
  mocks.sendChatAudio.mockResolvedValue(message);
  mocks.sendChatFile.mockResolvedValue(message);
});

describe('chat media outbox sync', () => {
  it('dispatches image/audio/file by media kind and preserves local asset metadata', async () => {
    await syncChatMediaOutbox(SNAP);
    expect(mocks.sendChatImage).toHaveBeenCalledWith('conv-1', { uri: item.uri, fileName: item.fileName, mimeType: item.mimeType }, 'token', 'csrf', undefined, 'media-op-1', undefined);
    expect(mocks.acknowledgeChatMedia).toHaveBeenCalledWith('media-op-1', 'user-1');

    mocks.listDueChatMediaOutbox.mockResolvedValueOnce([{ ...item, kind: 'audio', operationId: 'audio-op' }]);
    await syncChatMediaOutbox(SNAP);
    expect(mocks.sendChatAudio).toHaveBeenCalledWith('conv-1', expect.objectContaining({ uri: item.uri }), 'token', 'csrf', 'audio-op', undefined);

    mocks.listDueChatMediaOutbox.mockResolvedValueOnce([{ ...item, kind: 'file', operationId: 'file-op' }]);
    await syncChatMediaOutbox(SNAP);
    expect(mocks.sendChatFile).toHaveBeenCalledWith('conv-1', expect.objectContaining({ uri: item.uri }), 'token', 'csrf', 'file-op', undefined);
  });

  it('does not access queue when offline or signed out', async () => {
    expect((await syncChatMediaOutbox({ ...SNAP, isOnline: false })).stoppedReason).toBe('offline');
    expect((await syncChatMediaOutbox({ ...SNAP, ownerId: null })).stoppedReason).toBe('signed-out');
    expect(mocks.listDueChatMediaOutbox).not.toHaveBeenCalled();
  });

  it.each([400, 404, 422])('discards permanently rejected media with status %s', async (status) => {
    mocks.sendChatImage.mockRejectedValueOnce(new ApiError('rejected', status));
    mocks.listChatMediaOutbox.mockResolvedValueOnce([item]);
    const result = await syncChatMediaOutbox(SNAP);
    expect(mocks.discardRejectedChatMedia).toHaveBeenCalledWith('media-op-1', 'user-1');
    expect(mocks.deferChatMedia).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe('rejected');
  });

  it.each([401, 403])('preserves media and stops on authorization failure %s', async (status) => {
    mocks.sendChatImage.mockRejectedValueOnce(new ApiError('forbidden', status));
    mocks.listChatMediaOutbox.mockResolvedValueOnce([item]);
    const result = await syncChatMediaOutbox(SNAP);
    expect(mocks.deferChatMedia).toHaveBeenCalledWith('media-op-1', 'user-1', expect.any(ApiError));
    expect(mocks.discardRejectedChatMedia).not.toHaveBeenCalled();
    expect(result.stoppedReason).toBe('signed-out');
  });

  it('defers transient media errors for retry', async () => {
    mocks.sendChatImage.mockRejectedValueOnce(new Error('network'));
    mocks.listChatMediaOutbox.mockResolvedValueOnce([item]);
    const result = await syncChatMediaOutbox(SNAP);
    expect(mocks.deferChatMedia).toHaveBeenCalledWith('media-op-1', 'user-1', expect.any(Error));
    expect(result.stoppedReason).toBe('retry-scheduled');
  });
});
