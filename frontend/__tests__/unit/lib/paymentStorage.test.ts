/**
 * __tests__/unit/lib/paymentStorage.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listSavedPayees,
  savePayee,
  removePayee,
  listSavedNetCards,
  saveNetCard,
  removeNetCard,
  buildUssd,
  buildNetCardUssd,
  ussdTelHref,
  PAY_METHOD_LABELS,
} from '@/lib/paymentStorage';

const store = new Map<string, string>();

vi.mock('@/lib/localStore', () => ({
  localGet: <T,>(key: string, fallback: T): T => {
    const raw = store.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  localSet: (key: string, value: unknown) => {
    store.set(key, JSON.stringify(value));
  },
}));

describe('paymentStorage', () => {
  beforeEach(() => {
    store.clear();
  });

  it('saves and lists payees', () => {
    const entry = savePayee({ name: 'أحمد', number: '0599', method: 'jawwal' });
    expect(entry.id).toBeTruthy();
    expect(listSavedPayees()).toHaveLength(1);
    expect(listSavedPayees()[0].name).toBe('أحمد');
  });

  it('updates existing payee with same number+method', () => {
    savePayee({ name: 'قديم', number: '0599', method: 'jawwal' });
    savePayee({ name: 'جديد', number: '0599', method: 'jawwal' });
    expect(listSavedPayees()).toHaveLength(1);
    expect(listSavedPayees()[0].name).toBe('جديد');
  });

  it('removes payee by id', () => {
    const e = savePayee({ name: 'أ', number: '1', method: 'palpay' });
    removePayee(e.id);
    expect(listSavedPayees()).toHaveLength(0);
  });

  it('saves and removes net cards', () => {
    const c = saveNetCard({ username: 'u1', password: 'p1', label: 'بطاقة' });
    expect(listSavedNetCards()).toHaveLength(1);
    removeNetCard(c.id);
    expect(listSavedNetCards()).toHaveLength(0);
  });

  it('builds USSD codes and tel href', () => {
    expect(buildUssd('jawwal', 'friend', '0599', '10')).toBeTruthy();
    expect(ussdTelHref('*123#')).toMatch(/^tel:/);
    expect(buildNetCardUssd('user', 'pass')).toBeTruthy();
  });

  it('exposes Arabic method labels', () => {
    expect(PAY_METHOD_LABELS.jawwal).toBeTruthy();
    expect(PAY_METHOD_LABELS.palpay).toBeTruthy();
    expect(PAY_METHOD_LABELS.bank).toBeTruthy();
  });
});
