/**
 * PERF-BUNDLE-CHAT-01 — تصنيف تعارضات HTTP بلا أي اعتماديات (دالة صرفة).
 *
 * كان داخل lib/conflictResolver.ts الذي يستورد lib/offlineQueue (~33 KB مصدر) و sonner
 * لتثبيت مستمع التعارضات، فكانت واجهة الدردشة (ChatMessageRow/MessageStatusBar/
 * MessageQueuedActions) تسحب الطابور كاملًا لاستخدام classifyHttpConflict فقط.
 * conflictResolver.ts يعيد تصدير كل شيء من هنا فتبقى الاستيرادات القديمة صالحة.
 */

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
