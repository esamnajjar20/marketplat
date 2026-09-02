'use client';

/**
 * عرض طرق دفع المتجر للزبون:
 * قائمة بأسماء الطرق → عند الضغط: الاسم + الرقم + USSD + حفظ في المحفوظات.
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
  type StorePaymentMethod,
} from '@/lib/storePaymentMethods';
import { savePayee } from '@/lib/paymentStorage';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  /** JSON من المتجر أو مصفوفة */
  paymentMethods?: unknown;
  /** احتياطي إن لم يضبط المتجر طرقاً بعد */
  fallbackName?: string;
  fallbackPhone?: string;
  className?: string;
}

export function StorePaymentMethods({
  paymentMethods,
  fallbackName,
  fallbackPhone,
  className,
}: Props) {
  const methods = useMemo(() => {
    const list = normalizePaymentMethods(paymentMethods);
    if (list.length > 0) return list;
    // احتياطي: رقم هاتف المتجر كجوال بي إن وُجد
    if (fallbackPhone?.trim()) {
      return [
        {
          id: 'fallback-phone',
          kind: 'jawwal' as const,
          label: 'دفع عبر الهاتف',
          accountName: fallbackName?.trim() || 'المتجر',
          accountNumber: fallbackPhone.trim(),
        },
      ];
    }
    return [];
  }, [paymentMethods, fallbackName, fallbackPhone]);

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
      name: selected.accountName || selected.label,
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
        <p className="text-xs font-medium text-muted-foreground">طرق الدفع</p>
        <div className="flex flex-col gap-2">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelected(m);
                setAmount('');
                setCopied(false);
              }}
              className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-start text-sm font-semibold transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99]"
            >
              <span className="inline-flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" aria-hidden />
                {m.label}
              </span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.label}</DialogTitle>
            <DialogDescription>بيانات التحويل لهذا المتجر</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">الاسم</p>
                  <p className="font-semibold">{selected.accountName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الرقم</p>
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
