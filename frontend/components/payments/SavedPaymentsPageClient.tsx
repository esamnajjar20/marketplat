'use client';

/**
 * جهات الدفع وبطاقات النت — تخزين محلي بالكامل (تعمل بدون إنترنت).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  Wifi,
  Trash2,
  Copy,
  Check,
  Phone,
  Plus,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/ui/Dialog';
import {
  listSavedPayees,
  removePayee,
  savePayee,
  listSavedNetCards,
  removeNetCard,
  saveNetCard,
  buildUssd,
  buildNetCardUssd,
  ussdTelHref,
  PAY_METHOD_LABELS,
  type SavedPayee,
  type SavedNetCard,
  type PayMethod,
} from '@/lib/paymentStorage';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          toast.success(`تم نسخ ${label}`);
          setTimeout(() => setOk(false), 1500);
        } catch {
          toast.error('تعذّر النسخ');
        }
      }}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}

export function SavedPaymentsPageClient() {
  const [payees, setPayees] = useState<SavedPayee[]>([]);
  const [cards, setCards] = useState<SavedNetCard[]>([]);
  const [tab, setTab] = useState<'pay' | 'cards'>('pay');
  const [online, setOnline] = useState(true);

  const [addPayOpen, setAddPayOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [ussdPayee, setUssdPayee] = useState<SavedPayee | null>(null);
  const [ussdAmount, setUssdAmount] = useState('');
  const [ussdRecipient, setUssdRecipient] = useState<'friend' | 'merchant'>('friend');

  // نموذج إضافة جهة
  const [pName, setPName] = useState('');
  const [pNumber, setPNumber] = useState('');
  const [pMethod, setPMethod] = useState<PayMethod>('jawwal');

  // نموذج بطاقة
  const [cLabel, setCLabel] = useState('');
  const [cUser, setCUser] = useState('');
  const [cPass, setCPass] = useState('');

  const refresh = useCallback(() => {
    setPayees(listSavedPayees());
    setCards(listSavedNetCards());
  }, []);

  useEffect(() => {
    refresh();
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  function handleAddPayee() {
    if (!pNumber.trim()) {
      toast.error('أدخل الرقم');
      return;
    }
    savePayee({ name: pName.trim() || 'بدون اسم', number: pNumber.trim(), method: pMethod });
    toast.success('تم حفظ جهة الدفع');
    setPName('');
    setPNumber('');
    setAddPayOpen(false);
    refresh();
  }

  function handleAddCard() {
    if (!cUser.trim() || !cPass.trim()) {
      toast.error('أدخل اسم المستخدم وكلمة السر');
      return;
    }
    saveNetCard({ username: cUser.trim(), password: cPass.trim(), label: cLabel.trim() || undefined });
    const ussd = buildNetCardUssd(cUser.trim(), cPass.trim());
    toast.success('تم حفظ البطاقة', {
      action: ussd
        ? { label: 'USSD', onClick: () => { window.location.href = ussdTelHref(ussd); } }
        : undefined,
    });
    setCLabel('');
    setCUser('');
    setCPass('');
    setAddCardOpen(false);
    refresh();
  }

  function dialPayeeUssd() {
    if (!ussdPayee || ussdPayee.method === 'bank') {
      toast.error('USSD متاح لجوال بي وبال بي فقط');
      return;
    }
    if (!ussdAmount.trim()) {
      toast.error('أدخل المبلغ');
      return;
    }
    const code = buildUssd(ussdPayee.method, ussdRecipient, ussdPayee.number, ussdAmount);
    window.location.href = ussdTelHref(code);
  }

  return (
    <div className="space-y-6">
      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <WifiOff className="h-4 w-4 shrink-0" />
          أنت دون اتصال — المحفوظات متاحة من جهازك بدون نت.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-2xl border p-1">
        <button
          type="button"
          onClick={() => setTab('pay')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition',
            tab === 'pay' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          <Banknote className="h-4 w-4" />
          جهات الدفع ({payees.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('cards')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition',
            tab === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          <Wifi className="h-4 w-4" />
          بطاقات نت ({cards.length})
        </button>
      </div>

      {tab === 'pay' && (
        <section className="space-y-3">
          <Button type="button" className="w-full gap-2" onClick={() => setAddPayOpen(true)}>
            <Plus className="h-4 w-4" />
            إضافة جهة دفع
          </Button>
          {payees.length === 0 ? (
            <EmptyState
              icon={<Banknote className="h-7 w-7" />}
              title="لا جهات محفوظة"
              description="أضف رقماً من هنا أو من الدفع السريع — يُحفظ على جهازك ويعمل بدون نت."
            />
          ) : (
            <ul className="space-y-3">
              {payees.map((p) => (
                <li key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 font-mono text-sm" dir="ltr">{p.number}</p>
                      <p className="text-xs text-muted-foreground">{PAY_METHOD_LABELS[p.method]}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        removePayee(p.id);
                        refresh();
                        toast.success('تم الحذف');
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyBtn value={p.number} label="نسخ الرقم" />
                    {p.method !== 'bank' && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setUssdPayee(p);
                          setUssdAmount('');
                          setUssdRecipient('friend');
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        دفع USSD
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'cards' && (
        <section className="space-y-3">
          <Button type="button" className="w-full gap-2" onClick={() => setAddCardOpen(true)}>
            <Plus className="h-4 w-4" />
            إضافة بطاقة نت
          </Button>
          {cards.length === 0 ? (
            <EmptyState
              icon={<Wifi className="h-7 w-7" />}
              title="لا بطاقات محفوظة"
              description="أضف بطاقة من هنا — تُحفظ محلياً وتعمل بدون نت."
            />
          ) : (
            <ul className="space-y-3">
              {cards.map((c) => {
                const ussd = buildNetCardUssd(c.username, c.password);
                return (
                  <li key={c.id} className="space-y-3 rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{c.label || c.username}</p>
                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">المستخدم: </span>
                          <span className="font-mono" dir="ltr">{c.username}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">كلمة السر: </span>
                          <span className="font-mono" dir="ltr">{c.password}</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => {
                          removeNetCard(c.id);
                          refresh();
                          toast.success('تم الحذف');
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CopyBtn value={c.username} label="نسخ المستخدم" />
                      <CopyBtn value={c.password} label="نسخ كلمة السر" />
                      {ussd && (
                        <Button type="button" size="sm" className="gap-1.5" asChild>
                          <a href={ussdTelHref(ussd)} title={ussd}>
                            <Phone className="h-3.5 w-3.5" />
                            USSD
                          </a>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* إضافة جهة دفع */}
      <Dialog open={addPayOpen} onOpenChange={setAddPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة جهة دفع</DialogTitle>
            <DialogDescription>تُحفظ على جهازك وتعمل بدون إنترنت.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="الاسم" value={pName} onChange={(e) => setPName(e.target.value)} />
            <Input placeholder="الرقم" value={pNumber} onChange={(e) => setPNumber(e.target.value)} dir="ltr" />
            <div className="grid grid-cols-3 gap-2">
              {(['jawwal', 'palpay', 'bank'] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPMethod(m)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-xs font-medium',
                    pMethod === m ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
                  )}
                >
                  {PAY_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            <Button type="button" className="w-full" onClick={handleAddPayee}>
              حفظ الجهة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* إضافة بطاقة */}
      <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة بطاقة نت</DialogTitle>
            <DialogDescription>تُحفظ محلياً — بدون رفع للسيرفر.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="وصف (اختياري)" value={cLabel} onChange={(e) => setCLabel(e.target.value)} />
            <Input placeholder="اسم المستخدم / الرقم" value={cUser} onChange={(e) => setCUser(e.target.value)} dir="ltr" />
            <Input placeholder="كلمة السر" value={cPass} onChange={(e) => setCPass(e.target.value)} dir="ltr" />
            <Button type="button" className="w-full" onClick={handleAddCard}>
              حفظ البطاقة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* USSD لجهة دفع */}
      <Dialog open={!!ussdPayee} onOpenChange={(o) => !o && setUssdPayee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>دفع USSD — {ussdPayee?.name}</DialogTitle>
            <DialogDescription dir="ltr">{ussdPayee?.number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="المبلغ بالشيكل"
              value={ussdAmount}
              onChange={(e) => setUssdAmount(e.target.value)}
              inputMode="decimal"
              dir="ltr"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn('rounded-lg border px-3 py-2 text-sm', ussdRecipient === 'friend' && 'border-primary bg-primary/10')}
                onClick={() => setUssdRecipient('friend')}
              >
                لصديق
              </button>
              <button
                type="button"
                className={cn('rounded-lg border px-3 py-2 text-sm', ussdRecipient === 'merchant' && 'border-primary bg-primary/10')}
                onClick={() => setUssdRecipient('merchant')}
              >
                لتاجر
              </button>
            </div>
            <Button type="button" className="w-full gap-2" onClick={dialPayeeUssd}>
              <Phone className="h-4 w-4" />
              فتح الاتصال USSD
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
