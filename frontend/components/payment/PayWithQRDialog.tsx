'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Smartphone,
  Building2,
  Wallet,
  QrCode,
  Hash,
  ArrowRight,
  BookmarkPlus,
  User,
  Store,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/ui/Dialog';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { CopyField } from '@/components/payment/CopyField';
import { QrScannerCamera } from '@/components/payment/QrScannerCamera';
import type { PayParseResult } from '@/lib/smartScanParse';
import {
  type PayMethod,
  PAY_METHOD_LABELS,
  buildUssd,
  listSavedPayees,
  savePayee,
  type SavedPayee,
} from '@/lib/paymentStorage';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Step =
  | 'method'
  | 'scan'
  | 'result'
  | 'ussd-amount'
  | 'ussd-type'
  | 'ussd-code'
  | 'save';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  defaultNumber?: string;
}

const METHODS: {
  id: PayMethod;
  label: string;
  icon: typeof Smartphone;
  desc: string;
}[] = [
  { id: 'jawwal', label: 'جوال بي', icon: Smartphone, desc: 'امسح بالكاميرا لكشف الاسم والرقم' },
  { id: 'palpay', label: 'بال بي', icon: Wallet, desc: 'امسح بالكاميرا لكشف الاسم والرقم' },
  { id: 'bank', label: 'بنك فلسطين', icon: Building2, desc: 'امسح بالكاميرا لكشف الاسم ورقم الحساب' },
];

export function PayWithQRDialog({
  open,
  onOpenChange,
  defaultName = '',
  defaultNumber = '',
}: Props) {
  const [step, setStep] = useState<Step>('method');
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [name, setName] = useState(defaultName);
  const [number, setNumber] = useState(defaultNumber);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState<'friend' | 'merchant' | null>(null);
  const [savedList, setSavedList] = useState<SavedPayee[]>([]);
  const [rawScan, setRawScan] = useState('');

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setNumber(defaultNumber);
      setSavedList(listSavedPayees());
      setStep('method');
      setMethod(null);
      setAmount('');
      setRecipient(null);
      setRawScan('');
    }
  }, [open, defaultName, defaultNumber]);

  function resetAndClose(next: boolean) {
    if (!next) {
      setStep('method');
      setMethod(null);
      setAmount('');
      setRecipient(null);
      setRawScan('');
    }
    onOpenChange(next);
  }

  function pickMethod(m: PayMethod) {
    setMethod(m);
    setStep('scan');
  }

  function applySaved(p: SavedPayee) {
    setMethod(p.method);
    setName(p.name);
    setNumber(p.number);
    setStep('result');
  }

  function onScanned(text: string) {
    setRawScan(text);
  }

  function onPayParsed(parsed: PayParseResult) {
    if (parsed.name) setName(parsed.name);
    if (parsed.number) setNumber(parsed.number);
    setStep('result');
    const conf = Math.round(parsed.confidence * 100);
    toast.success(
      conf >= 70
        ? `تم الكشف بثقة ${conf}%`
        : 'تم المسح — راجع الاسم والرقم وعدّل إن لزم',
    );
  }

  const ussdCode = useMemo(() => {
    if (!method || method === 'bank' || !recipient || !number || !amount) return '';
    return buildUssd(method, recipient, number, amount);
  }, [method, recipient, number, amount]);

  function handleSave() {
    if (!method || !number.trim()) {
      toast.error('أدخل الرقم قبل الحفظ');
      return;
    }
    savePayee({
      name: name.trim() || 'بدون اسم',
      number: number.trim(),
      method,
    });
    toast.success('تم حفظ جهة الدفع');
    resetAndClose(false);
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            الدفع — مسح بالكاميرا
          </DialogTitle>
          <DialogDescription>
            {step === 'method' && 'اختر طريقة الدفع ثم امسح الرمز بالكاميرا'}
            {step === 'scan' && method && `وجّه الكاميرا للرمز — ${PAY_METHOD_LABELS[method]}`}
            {step === 'result' && 'البيانات المستخرجة من المسح'}
            {step === 'ussd-amount' && 'أدخل المبلغ بالشيكل'}
            {step === 'ussd-type' && 'الدفع لتاجر أم لصديق؟'}
            {step === 'ussd-code' && 'كود USSD جاهز'}
            {step === 'save' && 'حفظ الجهة للمرات القادمة؟'}
          </DialogDescription>
        </DialogHeader>

        {step === 'method' && (
          <div className="space-y-4">
            <div className="grid gap-2">
              {METHODS.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickMethod(id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-start transition',
                    'hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98]',
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-xs text-muted-foreground">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {savedList.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">محفوظة سابقًا</p>
                <ul className="max-h-36 space-y-1 overflow-y-auto">
                  {savedList.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => applySaved(p)}
                        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition hover:bg-muted"
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                          {p.number}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* كاميرا — لا كود مولَّد في البداية */}
        {step === 'scan' && method && (
          <div className="space-y-3">
            <QrScannerCamera onScan={onScanned} onPayParsed={onPayParsed} prefer="pay" />
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setStep('method')}>
              رجوع
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setStep('result')}
            >
              إدخال يدوي بدون مسح
            </Button>
          </div>
        )}

        {step === 'result' && method && (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-primary">البيانات المكتشفة</p>
              <p className="rounded-lg bg-background/80 px-3 py-2 text-sm">
                <span className="text-muted-foreground">الاسم: </span>
                <strong>{name.trim() || '—'}</strong>
              </p>
              <p className="rounded-lg bg-background/80 px-3 py-2 text-sm">
                <span className="text-muted-foreground">الرقم: </span>
                <strong dir="ltr">{number.trim() || '—'}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">تعديل الاسم</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">تعديل الرقم</label>
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className="font-mono"
              />
            </div>

            {number.trim() && <CopyField label="نسخ الرقم" value={number.trim()} mono />}
            {name.trim() && <CopyField label="نسخ الاسم" value={name.trim()} />}

            {rawScan && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">النص الخام من المسح</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded border bg-muted/40 p-2">{rawScan}</pre>
              </details>
            )}

            <div className="flex flex-col gap-2">
              {method !== 'bank' && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={!number.trim()}
                  onClick={() => setStep('ussd-amount')}
                >
                  <Hash className="h-4 w-4" />
                  كود USSD
                </Button>
              )}
              <Button type="button" className="w-full gap-2" disabled={!number.trim()} onClick={() => setStep('save')}>
                <BookmarkPlus className="h-4 w-4" />
                حفظ الجهة
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setStep('scan')}>
                مسح رمز آخر
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep('method')}>
                رجوع
              </Button>
            </div>
          </div>
        )}

        {step === 'ussd-amount' && (
          <div className="space-y-4">
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ ₪"
              dir="ltr"
              className="text-lg font-semibold"
            />
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setStep('result')}>
                رجوع
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={!amount || Number(amount) <= 0}
                onClick={() => setStep('ussd-type')}
              >
                التالي <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'ussd-type' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setRecipient('merchant');
                setStep('ussd-code');
              }}
              className="flex w-full items-center gap-3 rounded-xl border p-4 text-start hover:bg-primary/5"
            >
              <Store className="h-6 w-6 text-primary" />
              <span className="font-semibold">لتاجر / بائع</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRecipient('friend');
                setStep('ussd-code');
              }}
              className="flex w-full items-center gap-3 rounded-xl border p-4 text-start hover:bg-primary/5"
            >
              <User className="h-6 w-6 text-primary" />
              <span className="font-semibold">لصديق</span>
            </button>
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setStep('ussd-amount')}>
              رجوع
            </Button>
          </div>
        )}

        {step === 'ussd-code' && ussdCode && (
          <div className="space-y-4">
            <p className="text-center font-mono text-lg font-bold" dir="ltr">
              {ussdCode}
            </p>
            <CopyField label="كود USSD" value={ussdCode} mono />
            <a
              href={`tel:${ussdCode.replace(/#/g, '%23')}`}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              <Smartphone className="h-4 w-4" /> اتصال بالكود
            </a>
            <Button type="button" className="w-full" onClick={() => setStep('save')}>
              إنهاء
            </Button>
          </div>
        )}

        {step === 'save' && method && (
          <div className="space-y-4">
            <div className="rounded-xl border p-4 text-sm">
              <p>
                <span className="text-muted-foreground">الطريقة: </span>
                <strong>{PAY_METHOD_LABELS[method]}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">الاسم: </span>
                <strong>{name || '—'}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">الرقم: </span>
                <strong dir="ltr">{number || '—'}</strong>
              </p>
            </div>
            <Button type="button" className="w-full gap-2" onClick={handleSave}>
              <BookmarkPlus className="h-4 w-4" /> نعم، احفظ
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => resetAndClose(false)}>
              إغلاق بدون حفظ
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
