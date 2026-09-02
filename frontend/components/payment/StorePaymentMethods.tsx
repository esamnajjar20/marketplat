'use client';

/**
 * طرق دفع المتجر للزبون — متعددة حسب ما أضافه صاحب المتجر.
 *
 * 1) قائمة بأسماء كل الطرق
 * 2) عند الضغط: اسم المتجر + اسم الحساب + الرقم
 *    → نسخ | حفظ بالمحفوظات | USSD (جوال بي / بال بي)
 */

import { useMemo, useState } from 'react';
import { Banknote, Phone, BookmarkPlus, Copy, Check, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/ui/Dialog';
import {
  normalizePaymentMethods,
  supportsUssd,
  dialStoreMethodUssd,
  toLocalPayMethod,
  PAYMENT_KIND_STYLE,
  type StorePaymentMethod,
} from '@/lib/storePaymentMethods';
import { savePayee } from '@/lib/paymentStorage';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  paymentMethods?: unknown;
  /** اسم الحساب/المتجر/البائع يظهر داخل تفاصيل كل طريقة */
  entityName?: string;
  storeName?: string;
  fallbackName?: string;
  fallbackPhone?: string;
  className?: string;
}

export function StorePaymentMethods({
  paymentMethods,
  entityName,
  storeName,
  fallbackName,
  fallbackPhone,
  className,
}: Props) {
  const displayStoreName = (entityName || storeName || fallbackName || 'الحساب').trim();

  const methods = useMemo(() => {
    const list = normalizePaymentMethods(paymentMethods);
    if (list.length > 0) return list;
    // احتياطي فقط إذا لم يُضبط شيء بعد
    if (fallbackPhone?.trim()) {
      return [
        {
          id: 'fallback-phone',
          kind: 'jawwal' as const,
          label: 'دفع عبر الهاتف',
          accountName: displayStoreName,
          accountNumber: fallbackPhone.trim(),
        },
      ];
    }
    return [];
  }, [paymentMethods, fallbackPhone, displayStoreName]);

  const [selected, setSelected] = useState<StorePaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);

  if (methods.length === 0) return null;

  async function copyNumber() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.accountNumber);
      setCopied(true);
      toast.success('تم نسخ الرقم');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('تعذّر النسخ');
    }
  }

  function handleSave() {
    if (!selected) return;
    savePayee({
      name: selected.accountName || displayStoreName || selected.label,
      number: selected.accountNumber,
      method: toLocalPayMethod(selected.kind),
    });
    toast.success('تم الحفظ في محفوظات الدفع');
  }

  function handleUssd() {
    if (!selected || !supportsUssd(selected.kind)) return;
    if (!amount.trim()) {
      toast.error('أدخل المبلغ بالشيكل');
      return;
    }
    dialStoreMethodUssd(selected, amount);
  }

  return (
    <>
      <div className={cn('w-full max-w-sm space-y-2', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">طرق الدفع</p>
          {methods.length > 1 && (
            <span className="text-[11px] text-muted-foreground">{methods.length} خيارات</span>
          )}
        </div>

        {/* كل الطرق — ليست خياراً واحداً */}
        <ul className="flex flex-col gap-2" role="list">
          {methods.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(m);
                  setAmount('');
                  setCopied(false);
                }}
                className={cn('flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start transition active:scale-[0.99]', PAYMENT_KIND_STYLE[m.kind].chip)}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Banknote className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{m.label}</span>
                  </span>
                  {m.accountName && m.accountName !== m.label && (
                    <span className="mt-0.5 block truncate pe-6 text-[11px] text-muted-foreground">
                      {m.accountName}
                    </span>
                  )}
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.label}</DialogTitle>
            <DialogDescription>بيانات الدفع — {displayStoreName}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">المتجر</p>
                  <p className="font-semibold">{displayStoreName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">اسم المستلم / الحساب</p>
                  <p className="font-semibold">{selected.accountName || displayStoreName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">رقم المحفظة / البنك</p>
                  <p className="font-mono text-lg font-bold tracking-wide" dir="ltr">
                    {selected.accountNumber}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="gap-1.5" onClick={copyNumber}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  نسخ الرقم
                </Button>
                <Button type="button" variant="secondary" className="gap-1.5" onClick={handleSave}>
                  <BookmarkPlus className="h-4 w-4" />
                  حفظ في المحفوظات
                </Button>
              </div>

              {supportsUssd(selected.kind) && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">دفع عبر USSD</p>
                  <Input
                    placeholder="المبلغ بالشيكل"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    dir="ltr"
                  />
                  <Button type="button" className="w-full gap-2" onClick={handleUssd}>
                    <Phone className="h-4 w-4" />
                    فتح اتصال USSD
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
