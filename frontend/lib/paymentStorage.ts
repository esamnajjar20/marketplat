/**
 * حفظ محلي لجهات الدفع وبطاقات الإنترنت — بدون backend.
 * المفاتيح معزولة تحت marketplat: حتى لا تتعارض مع بيانات أخرى.
 */

const PAYEES_KEY = 'marketplat:saved-payees';
const CARDS_KEY = 'marketplat:saved-net-cards';

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

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function listSavedPayees(): SavedPayee[] {
  return readJson<SavedPayee[]>(PAYEES_KEY, []);
}

export function savePayee(payee: Omit<SavedPayee, 'id' | 'savedAt'>): SavedPayee {
  const list = listSavedPayees();
  const existing = list.find(
    (p) => p.number === payee.number && p.method === payee.method,
  );
  if (existing) {
    existing.name = payee.name;
    existing.savedAt = new Date().toISOString();
    writeJson(PAYEES_KEY, list);
    return existing;
  }
  const entry: SavedPayee = {
    ...payee,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  writeJson(PAYEES_KEY, [entry, ...list].slice(0, 30));
  return entry;
}

export function removePayee(id: string) {
  writeJson(
    PAYEES_KEY,
    listSavedPayees().filter((p) => p.id !== id),
  );
}

export function listSavedNetCards(): SavedNetCard[] {
  return readJson<SavedNetCard[]>(CARDS_KEY, []);
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
    writeJson(CARDS_KEY, list);
    return existing;
  }
  const entry: SavedNetCard = {
    ...card,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  writeJson(CARDS_KEY, [entry, ...list].slice(0, 30));
  return entry;
}

export function removeNetCard(id: string) {
  writeJson(
    CARDS_KEY,
    listSavedNetCards().filter((c) => c.id !== id),
  );
}

/** أكواد USSD حسب الشركة ونوع المستلم */
export function buildUssd(
  method: 'jawwal' | 'palpay',
  recipient: 'friend' | 'merchant',
  number: string,
  amount: string,
): string {
  const n = number.replace(/\D/g, '');
  const a = amount.replace(/[^\d.]/g, '');
  if (method === 'palpay') {
    // صديق: *370*1*1*الرقم*السعر#   تاجر: *370*2*الرقم*السعر#
    return recipient === 'friend'
      ? `*370*1*1*${n}*${a}#`
      : `*370*2*${n}*${a}#`;
  }
  // جوال بي — صديق: *268*1*الرقم*السعر#   تاجر: *268*2*الرقم*السعر#
  return recipient === 'friend'
    ? `*268*1*${n}*${a}#`
    : `*268*2*${n}*${a}#`;
}

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  jawwal: 'جوال بي',
  palpay: 'بال بي',
  bank: 'بنك فلسطين',
};
