/**
 * طرق دفع المتجر — يديرها صاحب المتجر، تُعرض للزبون ديناميكياً.
 */

import { buildUssd, ussdTelHref, type PayMethod } from '@/lib/paymentStorage';

export type StorePaymentKind = 'jawwal' | 'palpay' | 'bank' | 'custom';

export interface StorePaymentMethod {
  id: string;
  kind: StorePaymentKind;
  /** اسم يظهر في القائمة (جوال بي / مخصص…) */
  label: string;
  /** اسم صاحب الحساب / المستلم */
  accountName: string;
  /** رقم المحفظة أو الحساب */
  accountNumber: string;
}

export const PRESET_PAYMENT_KINDS: {
  kind: Exclude<StorePaymentKind, 'custom'>;
  label: string;
  supportsUssd: boolean;
}[] = [
  { kind: 'jawwal', label: 'جوال بي', supportsUssd: true },
  { kind: 'palpay', label: 'بال بي', supportsUssd: true },
  { kind: 'bank', label: 'بنك فلسطين', supportsUssd: false },
];

export const PAYMENT_KIND_STYLE: Record<StorePaymentKind, { chip: string; icon: string; dot: string }> = {
  jawwal: { chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300', icon: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  palpay: { chip: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300', icon: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500' },
  bank: { chip: 'border-slate-500/30 bg-slate-500/10 text-slate-800 dark:text-slate-300', icon: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
  custom: { chip: 'border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-300', icon: 'text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
};

export function supportsUssd(kind: StorePaymentKind): boolean {
  return kind === 'jawwal' || kind === 'palpay';
}

export function presetLabel(kind: StorePaymentKind): string {
  return PRESET_PAYMENT_KINDS.find((p) => p.kind === kind)?.label ?? 'طريقة دفع';
}

export function newPaymentMethodId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizePaymentMethods(raw: unknown): StorePaymentMethod[] {
  if (!Array.isArray(raw)) return [];
  const out: StorePaymentMethod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const kind = o.kind as StorePaymentKind;
    if (!['jawwal', 'palpay', 'bank', 'custom'].includes(kind)) continue;
    const accountNumber = String(o.accountNumber ?? '').trim();
    if (!accountNumber) continue;
    const label =
      String(o.label ?? '').trim() ||
      (kind === 'custom' ? 'طريقة دفع' : presetLabel(kind));
    out.push({
      id: String(o.id ?? newPaymentMethodId()),
      kind,
      label,
      accountName: String(o.accountName ?? '').trim() || label,
      accountNumber,
    });
  }
  return out;
}

/** USSD لتاجر (المتجر) — يحتاج مبلغ */
export function buildStoreMethodUssd(
  method: StorePaymentMethod,
  amount: string,
): string | null {
  if (!supportsUssd(method.kind)) return null;
  const payMethod = method.kind as 'jawwal' | 'palpay';
  return buildUssd(payMethod, 'merchant', method.accountNumber, amount);
}

export function dialStoreMethodUssd(method: StorePaymentMethod, amount: string) {
  const code = buildStoreMethodUssd(method, amount);
  if (!code) return;
  window.location.href = ussdTelHref(code);
}

/** تحويل لطريقة الحفظ المحلي (جهات الدفع) */
export function toLocalPayMethod(kind: StorePaymentKind): PayMethod {
  if (kind === 'palpay') return 'palpay';
  if (kind === 'bank') return 'bank';
  return 'jawwal'; // jawwal + custom → jawwal bucket for storage
}
