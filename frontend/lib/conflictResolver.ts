/**
 * CONFLICT-UX-01 — normalize 409 / 422 (and similar) mutation failures
 * into a stable shape the UI can act on: show the server message, offer
 * retry vs discard, and avoid treating them as generic network errors.
 *
 * Offline queue (sw.js) already marks hard 4xx as status:'failed' and
 * never auto-retries them. This helper is for *online* mutation hooks
 * and for the /settings/sync failed-list UI.
 */

export type ConflictKind =
  | 'version_conflict'   // 409 — resource changed under us
  | 'validation'         // 422 — payload rejected
  | 'forbidden'          // 403
  | 'not_found'          // 404
  | 'gone'               // 410
  | 'rate_limited'       // 429
  | 'other_client'       // other 4xx
  | 'server'             // 5xx
  | 'network';           // no response / status 0

export interface ConflictInfo {
  kind: ConflictKind;
  status: number;
  message: string;
  /** True when auto-retry is pointless (client/validation errors). */
  isTerminal: boolean;
  /** Suggested primary CTA for the UI. */
  primaryAction: 'retry' | 'discard' | 'edit' | 'login' | 'none';
}

const TERMINAL_KINDS: ReadonlySet<ConflictKind> = new Set([
  'version_conflict',
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
  else if (s === 409) kind = 'version_conflict';
  else if (s === 422) kind = 'validation';
  else if (s === 403) kind = 'forbidden';
  else if (s === 404) kind = 'not_found';
  else if (s === 410) kind = 'gone';
  else if (s === 429) kind = 'rate_limited';
  else if (s >= 400 && s < 500) kind = 'other_client';
  else if (s >= 500) kind = 'server';
  else kind = 'network';

  const defaults: Record<ConflictKind, string> = {
    version_conflict: 'تم تعديل هذا العنصر من مكان آخر — حدّث ثم أعد المحاولة',
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
  else if (kind === 'forbidden') primaryAction = 'none';
  else if (kind === 'not_found' || kind === 'gone') primaryAction = 'discard';
  else if (kind === 'version_conflict') primaryAction = 'retry';
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

/** Convenience: extract status + message from Axios-like or ParsedError shapes. */
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
  const status =
    e.statusCode ??
    e.status ??
    e.response?.status ??
    0;
  const message =
    e.message ??
    e.response?.data?.message ??
    null;
  return classifyHttpConflict(status, message);
}
