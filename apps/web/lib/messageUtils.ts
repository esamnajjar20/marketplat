/**
 * أدوات عرض الرسائل — فواصل الأيام، تحويل الروابط، تجميع بصري.
 */

/** تسمية فاصل اليوم في المحادثة */
export function messageDayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const dayParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Math.floor(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)) / 86_400_000);
  };
  const diff = dayParts(now) - dayParts(d);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'أمس';
  return d.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Gaza',
  });
}

export function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(da) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(db)
  );
}

/** هل الرسالة التالية لنفس المرسل وخلال دقيقتين؟ (تجميع بصري) */
export function isTightFollowUp(
  prev: { senderId: string; createdAt: string } | null | undefined,
  next: { senderId: string; createdAt: string },
): boolean {
  if (!prev) return false;
  if (prev.senderId !== next.senderId) return false;
  const delta = Math.abs(new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime());
  return delta < 120_000;
}

const URL_RE =
  /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;

/**
 * يقسّم النص إلى مقاطع نص/رابط للعرض الآمن (بدون HTML خام).
 */
export function splitMessageBody(
  body: string,
): { type: 'text' | 'link'; value: string; href?: string }[] {
  if (!body) return [{ type: 'text', value: '' }];
  const parts: { type: 'text' | 'link'; value: string; href?: string }[] = [];
  let last = 0;
  const re = new RegExp(URL_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', value: body.slice(last, m.index) });
    }
    const raw = m[0];
    const href = raw.startsWith('http') ? raw : `https://${raw}`;
    parts.push({ type: 'link', value: raw, href });
    last = m.index + raw.length;
  }
  if (last < body.length) {
    parts.push({ type: 'text', value: body.slice(last) });
  }
  return parts.length ? parts : [{ type: 'text', value: body }];
}

const DRAFT_PREFIX = 'msg-draft:';

export function loadMessageDraft(conversationId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(DRAFT_PREFIX + conversationId) ?? '';
  } catch {
    return '';
  }
}

export function saveMessageDraft(conversationId: string, body: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!body.trim()) sessionStorage.removeItem(DRAFT_PREFIX + conversationId);
    else sessionStorage.setItem(DRAFT_PREFIX + conversationId, body);
  } catch {
    /* private mode */
  }
}

export function clearMessageDraft(conversationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + conversationId);
  } catch {
    /* */
  }
}
