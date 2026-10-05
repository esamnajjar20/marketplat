/**
 * PHASE-4: surface server conflicts (409/412) from the offline queue.
 * Strategy: last-write-wins is already what a successful retry does;
 * when the server rejects, we notify the user to review or discard.
 */

import { toast } from 'sonner';
import {
  QUEUE_EVENT_TYPES,
  isConflictFailure,
  type QueuedRequestSummary,
} from '@/lib/offlineQueue';

let installed = false;

/**
 * SW-CONFLICT-TOAST-BATCH-01: batch conflicts into a single toast.
 *
 * Before: every QUEUE_ITEM_FAILED that resolved as a conflict fired its
 * own toast. A user who queued 8 items offline and reconnected to a
 * server that had moved on got 8 toasts stacked in ~2 seconds — each
 * identical, each pushing the previous offscreen. Very confusing and
 * entirely avoidable.
 *
 * Now: conflicts are accumulated during a 1.5s debounce window and
 * surfaced as ONE toast with a count. The most recent conflict's
 * message is used as the description; if there are multiple, the
 * count is prepended.
 *
 * The action button links to /settings/sync so the user has a direct
 * path to review or discard — previously the toast only told them to
 * "go to the sync center", with no way there.
 */

let pendingConflicts: string[] = [];
let conflictToastTimer: ReturnType<typeof setTimeout> | null = null;
const CONFLICT_BATCH_WINDOW_MS = 1500;

function flushConflictToast(): void {
  const conflicts = pendingConflicts;
  pendingConflicts = [];
  conflictToastTimer = null;
  if (conflicts.length === 0) return;

  const summary = conflicts[conflicts.length - 1];
  const description =
    conflicts.length === 1
      ? summary
      : `${conflicts.length} عمليات متعارضة — آخرها: ${summary}`;

  toast.error('تعارض مع نسخة السيرفر', {
    description,
    duration: 8000,
    action: {
      label: 'راجع',
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.location.assign('/offline?tab=sync');
        }
      },
    },
  });
}

function enqueueConflict(message: string | undefined): void {
  pendingConflicts.push(
    message ||
      'البيانات تغيّرت على السيرفر. راجع العنصر من مركز المزامنة أو احذف العملية.',
  );
  if (conflictToastTimer) clearTimeout(conflictToastTimer);
  conflictToastTimer = setTimeout(flushConflictToast, CONFLICT_BATCH_WINDOW_MS);
}

export function initConflictResolver(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== 'QUEUE_ITEM_FAILED') return;
    if (!QUEUE_EVENT_TYPES.includes(data.type)) return;

    const item: QueuedRequestSummary = {
      id: data.id,
      url: data.url ?? '',
      method: data.method ?? 'POST',
      // Not used by isConflictFailure — the check is purely on the
      // status code — but kept truthful rather than a misleading
      // Date.now().
      queuedAt: data.queuedAt ?? Date.now(),
      status: 'failed',
      lastError: {
        status: data.status ?? 0,
        message: data.message,
      },
      operationId: data.operationId ?? null,
    };

    if (!isConflictFailure(item)) return;

    enqueueConflict(item.lastError?.message);
  });
}


// ── CONFLICT-UX-01: shared classification (used by SyncCenter / ChatWindow / mutations) ──

export type ConflictKind =
  | 'version_conflict'
  | 'temporary_conflict'
  | 'validation'
  | 'forbidden'
  | 'not_found'
  | 'gone'
  | 'rate_limited'
  | 'other_client'
  | 'server'
  | 'network';

export interface ConflictInfo {
  kind: ConflictKind;
  status: number;
  message: string;
  isTerminal: boolean;
  primaryAction: 'retry' | 'discard' | 'edit' | 'login' | 'none';
}

const TERMINAL_KINDS: ReadonlySet<ConflictKind> = new Set([
  'version_conflict',
  'temporary_conflict',
  'validation',
  'forbidden',
  'not_found',
  'gone',
  'other_client',
]);

export function classifyHttpConflict(
  status: number | undefined | null,
  message?: string | null,
): ConflictInfo {
  const s = typeof status === 'number' ? status : 0;
  const msg = (message || '').trim();

  let kind: ConflictKind;
  if (s === 0) kind = 'network';
  else if (s === 412) kind = 'version_conflict';
  else if (s === 409 && /currently being updated|already in progress|try again in a moment|try again shortly|قيد التحديث|قيد المعالجة|حاول مرة أخرى بعد قليل|حاول لاحقًا|جار(?:ي|ٍ) تحديث|جار(?:ي|ٍ) معالجة/i.test(msg)) kind = 'temporary_conflict';
  else if (s === 409) kind = 'other_client';
  else if (s === 422) kind = 'validation';
  else if (s === 403) kind = 'forbidden';
  else if (s === 404) kind = 'not_found';
  else if (s === 410) kind = 'gone';
  else if (s === 429) kind = 'rate_limited';
  else if (s >= 400 && s < 500) kind = 'other_client';
  else if (s >= 500) kind = 'server';
  else kind = 'network';

  const defaults: Record<ConflictKind, string> = {
    version_conflict: 'لم يُطبَّق التغيير لأن النسخة التي يعتمد عليها الطلب لم تعد مطابقة لنسخة السيرفر',
    temporary_conflict: 'العملية قيد التنفيذ على السيرفر الآن — انتظر قليلًا ثم أعد المحاولة',
    validation: 'البيانات المرسلة غير مقبولة — راجع الحقول',
    forbidden: 'ليس لديك صلاحية لهذا الإجراء',
    not_found: 'العنصر لم يعد موجودًا',
    gone: 'العنصر أُزيل نهائيًا',
    rate_limited: 'محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة',
    other_client: 'رفض السيرفر الطلب',
    server: 'خطأ في السيرفر — أعد المحاولة لاحقًا',
    network: 'لا يوجد اتصال',
  };

  let primaryAction: ConflictInfo['primaryAction'] = 'retry';
  if (kind === 'validation') primaryAction = 'edit';
  else if (kind === 'temporary_conflict') primaryAction = 'retry';
  else if (kind === 'forbidden') primaryAction = 'none';
  else if (kind === 'not_found' || kind === 'gone') primaryAction = 'discard';
  else if (kind === 'version_conflict') primaryAction = 'edit';
  else if (kind === 'other_client') primaryAction = 'edit';
  else if (kind === 'network' || kind === 'server' || kind === 'rate_limited') {
    primaryAction = 'retry';
  }

  return {
    kind,
    status: s,
    message: msg || defaults[kind],
    isTerminal: TERMINAL_KINDS.has(kind),
    primaryAction,
  };
}

export function conflictFromUnknown(err: unknown): ConflictInfo {
  if (!err || typeof err !== 'object') {
    return classifyHttpConflict(0);
  }
  const e = err as {
    statusCode?: number;
    status?: number;
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };
  const status = e.statusCode ?? e.status ?? e.response?.status ?? 0;
  const message = e.message ?? e.response?.data?.message ?? null;
  return classifyHttpConflict(status, message);
}
