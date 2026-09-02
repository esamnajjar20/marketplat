'use client';

/**
 * زر «دفع» واحد على الصفحة → يفتح حواراً بكل طرق الدفع.
 * اختيار طريقة: الاسم + الرقم + نسخ + حفظ + USSD.
 */

import { useMemo, useState } from 'react';
import { Banknote, Phone, BookmarkPlus, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
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
  entityName?: string;
  storeName?: string;
  fallbackName?: string;
  fallbackPhone?: string;
  className?: string;
  buttonLabel?: string;
  variant?: 'default' | 'outline' | 'secondary';
}

export function StorePaymentMethods({
  paymentMethods,
  entityName,
  storeName,
  fallbackName,
  fallbackPhone,
  className,
  buttonLabel = 'دفع',
  variant = 'default',
}: Props) {
  const displayName = (entityName || storeName || fallbackName || 'الحساب').trim();

  const methods = useMemo(() => {
    const list = normalizePaymentMethods(paymentMethods);
    if (list.length > 0) return list;
    if (fallbackPhone?.trim()) {
      return [
        {
          id: 'fallback-phone',
          kind: 'jawwal' as const,
          label: 'دفع عبر الهاتف',
          accountName: displayName,
          accountNumber: fallbackPhone.trim(),
        },
      ];
    }
    return [];
  }, [paymentMethods, fallbackPhone, displayName]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StorePaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);

  if (methods.length === 0) return null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelected(null);
      setAmount('');
      setCopied(false);
    }
  }

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
      name: selected.accountName || displayName || selected.label,
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
      <div className={cn('w-full max-w-sm', className)}>
        <Button
          type="button"
          variant={variant}
          className="h-auto w-full gap-2 rounded-full py-2.5 text-sm font-semibold"
          onClick={() => setOpen(true)}
        >
          <Banknote className="h-4 w-4" aria-hidden />
          {buttonLabel}
          {methods.length > 1 && (
            <span className="rounded-full bg-background/20 px-1.5 text-[11px] font-medium tabular-nums">
              {methods.length}
            </span>
          )}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? selected.label : 'طرق الدفع'}</DialogTitle>
            <DialogDescription>
              {selected
                ? `بيانات الدفع — ${displayName}`
                : `اختر طريقة الدفع لـ ${displayName}`}
            </DialogDescription>
          </DialogHeader>

          {!selected ? (
            <ul className="flex flex-col gap-2" role="list">
              {methods.map((m) => {
                const style = PAYMENT_KIND_STYLE[m.kind];
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(m);
                        setAmount('');
                        setCopied(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start transition active:scale-[0.99]',
                        style.chip,
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden />
                          <Banknote className={cn('h-4 w-4 shrink-0', style.icon)} aria-hidden />
                          <span className="truncate">{m.label}</span>
                        </span>
                        {m.accountName && m.accountName !== m.label && (
                          <span className="mt-0.5 block truncate pe-6 text-[11px] opacity-80">
                            {m.accountName}
                          </span>
                        )}
                      </span>
                      <ChevronLeft className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
                كل الطرق
              </button>

              <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">الحساب</p>
                  <p className="font-semibold">{displayName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">اسم المستلم</p>
                  <p className="font-semibold">{selected.accountName || displayName}</p>
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
