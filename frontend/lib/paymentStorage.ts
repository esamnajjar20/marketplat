/**
 * حفظ محلي لجهات الدفع وبطاقات الإنترنت — عبر localStore الموحّد.
 */

import { localGet, localSet } from '@/lib/localStore';

const PAYEES_KEY = 'saved-payees';
const CARDS_KEY = 'saved-net-cards';
const LEGACY_PAYEES = 'marketplat:saved-payees';
const LEGACY_CARDS = 'marketplat:saved-net-cards';

export type PayMethod = 'jawwal' | 'palpay' | 'bank';

export interface SavedPayee {
  id: string;
  name: string;
  number: string;
  method: PayMethod;
  savedAt: string;
}

export interface SavedNetCard {
  id: string;
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

export function listSavedPayees(): SavedPayee[] {
  return migrateLegacy<SavedPayee>(LEGACY_PAYEES, PAYEES_KEY);
}

export function savePayee(payee: Omit<SavedPayee, 'id' | 'savedAt'>): SavedPayee {
  const list = listSavedPayees();
  const existing = list.find(
    (p) => p.number === payee.number && p.method === payee.method,
  );
  if (existing) {
    existing.name = payee.name;
    existing.savedAt = new Date().toISOString();
    localSet(PAYEES_KEY, list);
    return existing;
  }
  const entry: SavedPayee = {
    ...payee,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  localSet(PAYEES_KEY, [entry, ...list].slice(0, 30));
  return entry;
}

export function removePayee(id: string) {
  localSet(
    PAYEES_KEY,
    listSavedPayees().filter((p) => p.id !== id),
  );
}

export function listSavedNetCards(): SavedNetCard[] {
  return migrateLegacy<SavedNetCard>(LEGACY_CARDS, CARDS_KEY);
}

export function saveNetCard(
  card: Omit<SavedNetCard, 'id' | 'savedAt'>,
): SavedNetCard {
  const list = listSavedNetCards();
  const existing = list.find((c) => c.username === card.username);
  if (existing) {
    existing.password = card.password;
    existing.label = card.label;
    existing.savedAt = new Date().toISOString();
    localSet(CARDS_KEY, list);
    return existing;
  }
  const entry: SavedNetCard = {
    ...card,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  localSet(CARDS_KEY, [entry, ...list].slice(0, 30));
  return entry;
}

export function removeNetCard(id: string) {
  localSet(
    CARDS_KEY,
    listSavedNetCards().filter((c) => c.id !== id),
  );
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
  return `tel:${ussdCode.replace(/#/g, '%23')}`;
}


export function buildNetCardUssd(username: string, password?: string): string {
  const u = username.trim();
  if (!u) return '';
  if (password?.trim()) return `*122*${u}*${password.trim()}#`;
  return `*122*${u}#`;
}

