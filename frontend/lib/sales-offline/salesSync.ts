'use client';

import { salesApi } from '@/api/sales.api';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import { isDeviceOffline } from '@/lib/offlineError';
import {
  createSalesDraft,
  deleteSalesDraft,
  listSalesDrafts,
  getSalesDraft,
  updateSalesDraft,
  type SalesOfflineDraft,
} from './salesDraftStore';
import type { CreateSalePayload } from '@/types/sale.types';
import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';

export function createSaleOperationId(): string {
  return newOfflineOperationId();
}

export async function persistSalesDraft(userId: string, operationId: string, payload: CreateSalePayload): Promise<void> {
  await createSalesDraft(userId, operationId, payload);
}

function isQueuedOrNetworkFailure(error: unknown): boolean {
  const e = error as { code?: string; statusCode?: number; status?: number } | null;
  return e?.code === 'NETWORK_ERROR' || e?.code === 'OFFLINE_QUEUED' || e?.statusCode === 202 || e?.status === 0;
}

export async function createSaleWithOfflineSupport(
  userId: string,
  payload: CreateSalePayload,
  operationId = createSaleOperationId(),
) {
  // Persist before the first network attempt. This guarantees a sale survives
  // a tab crash, browser restart, or an offline fast-fail before SW sees it.
  await persistSalesDraft(userId, operationId, payload);
  try {
    const result = await salesApi.create(payload, operationId);
    await deleteSalesDraft(operationId, userId);
    return { result: result.data.data, queued: false, operationId };
  } catch (error) {
    if (isQueuedOrNetworkFailure(error) || isDeviceOffline()) {
      await updateSalesDraft(operationId, userId, { status: 'pending', lastError: undefined });
      return { result: null, queued: true, operationId };
    }
    await updateSalesDraft(operationId, userId, {
      status: isConflictError(error) ? 'conflict' : 'failed',
      lastError: errorDetails(error),
    });
    throw error;
  }
}

export async function syncSalesDraft(draft: SalesOfflineDraft) {
  try {
    const result = await salesApi.create(draft.payload, draft.operationId);
    await deleteSalesDraft(draft.operationId, draft.userId);
    return { ok: true as const, result: result.data.data };
  } catch (error) {
    await updateSalesDraft(draft.operationId, draft.userId, {
      status: isConflictError(error) ? 'conflict' : 'pending',
      lastError: errorDetails(error),
    });
    return { ok: false as const, conflict: isConflictError(error), error };
  }
}

export async function syncPendingSales(userId: string | null): Promise<{ sent: number; failed: number; conflicts: number }> {
  if (isDeviceOffline() || !userId) return { sent: 0, failed: 0, conflicts: 0 };
  const drafts = await listSalesDrafts(userId);
  let sent = 0;
  let failed = 0;
  let conflicts = 0;
  for (const draft of drafts) {
    if (draft.status === 'conflict') continue;
    const result = await syncSalesDraft(draft);
    if (result.ok) sent += 1;
    else if (result.conflict) conflicts += 1;
    else failed += 1;
  }
  return { sent, failed, conflicts };
}

export function initSalesOfflineSync(): () => void {
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; operationId?: string | null; status?: number; message?: string } | null;
    if (!data?.operationId) return;
    if (data.type === 'QUEUE_ITEM_SENT') {
      const userId = getCurrentOfflineUserId();
      if (userId) void deleteSalesDraft(data.operationId, userId);
    } else if (data.type === 'QUEUE_ITEM_FAILED') {
      const userId = getCurrentOfflineUserId();
      if (userId) void updateSalesDraft(data.operationId, userId, {
        status: data.status === 409 || data.status === 412 ? 'conflict' : 'failed',
        lastError: { status: data.status, message: data.message },
      });
    } else if (data.type === 'QUEUE_ITEM_CANCELLED') {
      const userId = getCurrentOfflineUserId();
      if (userId) void updateSalesDraft(data.operationId, userId, { status: 'failed', lastError: { message: 'تم إيقاف الإرسال من مركز المزامنة.' } });
    }
  };
  navigator.serviceWorker?.addEventListener('message', onMessage);
  return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
}

export async function resolveSalesConflict(operationId: string, action: 'retry' | 'discard'): Promise<void> {
  const userId = getCurrentOfflineUserId();
  if (!userId) return;
  const draft = await getSalesDraft(operationId, userId);
  if (!draft) return;
  if (action === 'discard') {
    await deleteSalesDraft(operationId, userId);
    return;
  }
  await updateSalesDraft(operationId, userId, { status: 'pending', lastError: undefined });
  await syncSalesDraft({ ...draft, status: 'pending', lastError: undefined });
}

function isConflictError(error: unknown): boolean {
  const e = error as { statusCode?: number; response?: { status?: number } } | null;
  const status = e?.statusCode ?? e?.response?.status;
  return status === 409 || status === 412;
}

function errorDetails(error: unknown): { status?: number; message?: string } {
  const e = error as { statusCode?: number; response?: { status?: number }; message?: string } | null;
  return { status: e?.statusCode ?? e?.response?.status, message: e?.message };
}
