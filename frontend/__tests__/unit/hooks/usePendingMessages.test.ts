/**
 * __tests__/unit/hooks/usePendingMessages.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePendingMessages } from '@/hooks/queries/usePendingMessages';
import { listQueuedMessages } from '@/lib/offlineMessagesQueue';
import { QUEUE_UPDATED_EVENT } from '@/hooks/useQueuedRequestCount';

vi.mock('@/lib/offlineMessagesQueue', () => ({
  listQueuedMessages: vi.fn(async () => []),
  QUEUE_MESSAGE_EVENT_TYPES: ['QUEUE_FLUSHED', 'QUEUE_ITEM_FAILED'],
}));

vi.mock('@/hooks/useQueuedRequestCount', () => ({
  QUEUE_UPDATED_EVENT: 'offline-queue:updated',
}));

describe('usePendingMessages', () => {
  beforeEach(() => {
    vi.mocked(listQueuedMessages).mockReset();
    vi.mocked(listQueuedMessages).mockResolvedValue([]);
  });

  it('loads queued messages for conversation', async () => {
    vi.mocked(listQueuedMessages).mockResolvedValue([
      { id: 1, conversationId: 'c1', body: 'مرحبا', status: 'pending' },
    ] as never);
    const { result } = renderHook(() => usePendingMessages('c1'));
    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
    expect(listQueuedMessages).toHaveBeenCalledWith('c1');
    expect(result.current[0]).toMatchObject({ body: 'مرحبا' });
  });

  it('refreshes on queue update event', async () => {
    vi.mocked(listQueuedMessages)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 2, conversationId: 'c1', body: 'جديد', status: 'pending' },
      ] as never);
    const { result } = renderHook(() => usePendingMessages('c1'));
    await waitFor(() => expect(listQueuedMessages).toHaveBeenCalled());
    await act(async () => {
      window.dispatchEvent(new Event(QUEUE_UPDATED_EVENT));
    });
    await waitFor(() => {
      expect(result.current.some((m) => m.body === 'جديد')).toBe(true);
    });
  });
});
