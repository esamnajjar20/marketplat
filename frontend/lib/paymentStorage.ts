/**
 * حفظ محلي لجهات الدفع وبطاقات الإنترنت — عبر localStore الموحّد.
 */

import { localGet, localSet } from '@/lib/localStore';

const PAYEES_KEY = 'saved-payees';
const CARDS_KEY = 'saved-net-cards';
const LEGACY_PAYEES = 'marketplat:saved-payees';
const LEGACY_CARDS = 'marketplat:saved-net-cards';

/**
 * FIX PAYMENT-USER-SCOPE: معرّف المستخدم الحالي — يُقرأ من Zustand
 * persist في localStorage (`marketplace-auth`). بدونه، User B يرى
 * جهات دفع User A + بطاقات نت A (بكلمات مرور plaintext).
 *
 * لماذا localStorage بدل استيراد auth.store؟ تجنب circular deps —
 * paymentStorage يُستدعى من components، و auth.store يُستدعى في كل مكان.
 */
function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('marketplace-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { user?: { id?: string } } };
    return parsed?.state?.user?.id ?? null;
  } catch {
    return null;
  }
}

export type PayMethod = 'jawwal' | 'palpay' | 'bank';

export interface SavedPayee {
  id: string;
  /** FIX PAYMENT-USER-SCOPE: مالك الجهة. null لعناصر قديمة. */
  userId?: string | null;
  name: string;
  number: string;
  method: PayMethod;
  savedAt: string;
}

export interface SavedNetCard {
  id: string;
  /** FIX PAYMENT-USER-SCOPE */
  userId?: string | null;
  label?: string;
  username: string;
  password: string;
  savedAt: string;
}

function migrateLegacy<T>(legacyKey: string, newKey: string): T[] {
  if (typeof window === 'undefined') return [];
  const current = localGet<T[]>(newKey, []);
  if (current.length > 0) return current;
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    if (Array.isArray(parsed) && parsed.length) {
      localSet(newKey, parsed);
      localStorage.removeItem(legacyKey);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * FIX PAYMENT-MULTI-USER-WRITE-01: raw (unfiltered) readers for mutation
 * paths. localSet replaces the WHOLE array, so any write MUST start from
 * the full list -- using listSavedPayees()/listSavedNetCards() (already
 * filtered to the current user) as a mutation base silently deleted
 * every other user's rows on the same device. Every writer below reads
 * through these now. Public list*() stay filtered for UI.
 */
function allPayees(): SavedPayee[] {
  return migrateLegacy<SavedPayee>(LEGACY_PAYEES, PAYEES_KEY);
}
function allNetCards(): SavedNetCard[] {
  return migrateLegacy<SavedNetCard>(LEGACY_CARDS, CARDS_KEY);
}

export function listSavedPayees(): SavedPayee[] {
  // FIX PAYMENT-USER-SCOPE: فلترة — عناصر قديمة بلا userId تُعرَض لو
  // ما في userId حالي (زائر).
  const uid = getCurrentUserId();
  return allPayees().filter((p) => (p.userId ?? null) === uid);
}

export function savePayee(payee: Omit<SavedPayee, 'id' | 'savedAt'>): SavedPayee {
  const uid = getCurrentUserId();
  const all = allPayees();
  const existingIdx = all.findIndex(
    (p) => (p.userId ?? null) === uid && p.number === payee.number && p.method === payee.method,
  );
  if (existingIdx >= 0) {
    const existing = all[existingIdx];
    if (existing) {
      existing.name = payee.name;
      existing.savedAt = new Date().toISOString();
      localSet(PAYEES_KEY, all);
      return existing;
    }
  }
  const entry: SavedPayee = {
    ...payee,
    userId: uid,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  // FIX PAYMENT-LIST-CAP: 60 سقف عام (30 × مستخدمين محتملين على نفس الجهاز).
  const merged = [entry, ...all];
  localSet(PAYEES_KEY, merged.slice(0, 60));
  return entry;
}

export function removePayee(id: string) {
  const uid = getCurrentUserId();
  localSet(
    PAYEES_KEY,
    allPayees().filter((p) => !(p.id === id && (p.userId ?? null) === uid)),
  );
}

/** تحديث جهة دفع محفوظة بالـ id */
export function updatePayee(
  id: string,
  patch: Partial<Omit<SavedPayee, 'id' | 'savedAt'>>,
): SavedPayee | null {
  const uid = getCurrentUserId();
  const all = allPayees();
  const idx = all.findIndex((p) => p.id === id && (p.userId ?? null) === uid);
  if (idx < 0) return null;
  const existing = all[idx];
  if (!existing) return null;
  const updated: SavedPayee = {
    ...existing,
    ...patch,
    name: patch.name ?? existing.name,
    id: existing.id,
    savedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  localSet(PAYEES_KEY, all);
  return updated;
}

export function listSavedNetCards(): SavedNetCard[] {
  // FIX PAYMENT-USER-SCOPE
  const uid = getCurrentUserId();
  return allNetCards().filter((c) => (c.userId ?? null) === uid);
}

export function saveNetCard(
  card: Omit<SavedNetCard, 'id' | 'savedAt'>,
): SavedNetCard {
  const uid = getCurrentUserId();
  const all = allNetCards();
  const existingIdx = all.findIndex(
    (c) => (c.userId ?? null) === uid && c.username === card.username,
  );
  if (existingIdx >= 0) {
    const existing = all[existingIdx];
    if (existing) {
      existing.password = card.password;
      existing.label = card.label;
      existing.savedAt = new Date().toISOString();
      localSet(CARDS_KEY, all);
      return existing;
    }
  }
  const entry: SavedNetCard = {
    ...card,
    userId: uid,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  const merged = [entry, ...all];
  localSet(CARDS_KEY, merged.slice(0, 60));
  return entry;
}

export function removeNetCard(id: string) {
  const uid = getCurrentUserId();
  localSet(
    CARDS_KEY,
    allNetCards().filter((c) => !(c.id === id && (c.userId ?? null) === uid)),
  );
}

/** تحديث بطاقة نت محفوظة بالـ id */
export function updateNetCard(
  id: string,
  patch: Partial<Omit<SavedNetCard, 'id' | 'savedAt'>>,
): SavedNetCard | null {
  const uid = getCurrentUserId();
  const all = allNetCards();
  const idx = all.findIndex((c) => c.id === id && (c.userId ?? null) === uid);
  if (idx < 0) return null;
  const existing = all[idx];
  if (!existing) return null;
  const updated: SavedNetCard = {
    ...existing,
    ...patch,
    username: patch.username ?? existing.username,
    id: existing.id,
    savedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  localSet(CARDS_KEY, all);
  return updated;
}

/**
 * FIX PAYMENT-CLEAR-ON-LOGOUT: يحذف جهات الدفع + بطاقات النت الخاصة
 * بالمستخدم الحالي — يُستدعى من authCleanup عند logout.
 * لا يحذف عناصر مستخدمين آخرين على نفس الجهاز.
 */
export function clearSavedPaymentMethods(): void {
  const uid = getCurrentUserId();
  localSet(PAYEES_KEY, allPayees().filter((p) => (p.userId ?? null) !== uid));
  localSet(CARDS_KEY, allNetCards().filter((c) => (c.userId ?? null) !== uid));
}

export function buildUssd(
  method: 'jawwal' | 'palpay',
  recipient: 'friend' | 'merchant',
  number: string,
  amount: string,
): string {
  const n = number.replace(/\D/g, '');
  const a = amount.replace(/[^\d.]/g, '');
  if (method === 'palpay') {
    return recipient === 'friend'
      ? `*370*1*1*${n}*${a}#`
      : `*370*2*${n}*${a}#`;
  }
  return recipient === 'friend'
    ? `*268*1*${n}*${a}#`
    : `*268*2*${n}*${a}#`;
}

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  jawwal: 'جوال بي',
  palpay: 'بال بي',
  bank: 'بنك فلسطين',
};


export function ussdTelHref(ussdCode: string): string {
  if (!ussdCode) return '';
  // FIX USSD-TEL-HREF-HARDEN-01: previously only `#` was escaped, so any
  // reserved character that slipped through a caller (username/password
  // in buildNetCardUssd, e.g.) could inject into the tel: URL -- a `?`
  // becomes a pause on Android dialers, and spaces/control chars are
  // undefined behavior in the href parser. Whitelist to the character
  // set that a USSD code can legitimately contain, then encode # for
  // href safety.
  const safe = ussdCode.replace(/[^\d*#+\-.]/g, '');
  return `tel:${safe.replace(/#/g, '%23')}`;
}


export function buildNetCardUssd(username: string, password?: string): string {
  const u = username.trim();
  if (!u) return '';
  if (password?.trim()) return `*122*${u}*${password.trim()}#`;
  return `*122*${u}#`;
}
