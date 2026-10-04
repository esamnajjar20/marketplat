'use client';

/**
 * المحفوظات المحلية — جهات الدفع وبطاقات النت.
 * بدون QR / مسح (مخفي لأن النظام غير مستقر) — الإضافة والتعديل اليدوي هما الأساس.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Banknote,
  Wifi,
  Trash2,
  Copy,
  Check,
  Phone,
  Plus,
  WifiOff,
  Search,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
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
  updatePayee,
  listSavedNetCards,
  removeNetCard,
  saveNetCard,
  updateNetCard,
  buildUssd,
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
  // SW-FIX-COPYBTN-CLEANUP: track the reset timeout so it can be cleared
  // on unmount — the old inline setTimeout kept a reference to setOk on
  // a potentially-unmounted component (harmless in React 18+, but a
  // leak). Same pattern as MessageInput's typingTimer.
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

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
          if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
          resetTimerRef.current = setTimeout(() => setOk(false), 1500);
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
  const [query, setQuery] = useState('');

  const [addPayOpen, setAddPayOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [editPayee, setEditPayee] = useState<SavedPayee | null>(null);
  const [editCard, setEditCard] = useState<SavedNetCard | null>(null);
  const [ussdPayee, setUssdPayee] = useState<SavedPayee | null>(null);
  const [ussdAmount, setUssdAmount] = useState('');
  const [ussdRecipient, setUssdRecipient] = useState<'friend' | 'merchant'>('friend');
  // SW-FIX-SPPC-CONFIRM: replaces two unconfirmed single-tap deletions.
  // Both removePayee and removeNetCard are irreversible and can lose a
  // number the user may not have any other record of.
  const [confirmDeletePayee, setConfirmDeletePayee] = useState<SavedPayee | null>(null);
  const [confirmDeleteCard, setConfirmDeleteCard] = useState<SavedNetCard | null>(null);

  const [pName, setPName] = useState('');
  const [pNumber, setPNumber] = useState('');
  const [pMethod, setPMethod] = useState<PayMethod>('jawwal');

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

  const q = query.trim().toLowerCase();

  const filteredPayees = useMemo(() => {
    if (!q) return payees;
    return payees.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.number.toLowerCase().includes(q) ||
        (PAY_METHOD_LABELS[p.method] ?? p.method).toLowerCase().includes(q),
    );
  }, [payees, q]);

  const filteredCards = useMemo(() => {
    if (!q) return cards;
    return cards.filter(
      (c) =>
        (c.label ?? '').toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q),
    );
  }, [cards, q]);

  function resetPayForm() {
    setPName('');
    setPNumber('');
    setPMethod('jawwal');
  }

  function resetCardForm() {
    setCLabel('');
    setCUser('');
    setCPass('');
  }

  function handleAddPay() {
    if (!pName.trim() || !pNumber.trim()) {
      toast.error('الاسم والرقم مطلوبان');
      return;
    }
    savePayee({ name: pName.trim(), number: pNumber.trim(), method: pMethod });
    toast.success('تم حفظ جهة الدفع');
    resetPayForm();
    setAddPayOpen(false);
    refresh();
  }

  function handleEditPay() {
    if (!editPayee) return;
    if (!pName.trim() || !pNumber.trim()) {
      toast.error('الاسم والرقم مطلوبان');
      return;
    }
    updatePayee(editPayee.id, {
      name: pName.trim(),
      number: pNumber.trim(),
      method: pMethod,
    });
    toast.success('تم تحديث جهة الدفع');
    setEditPayee(null);
    resetPayForm();
    refresh();
  }

  function handleAddCard() {
    if (!cUser.trim()) {
      toast.error('اسم المستخدم / الرقم مطلوب');
      return;
    }
    saveNetCard({
      label: cLabel.trim() || undefined,
      username: cUser.trim(),
      password: cPass,
    });
    toast.success('تم حفظ البطاقة');
    resetCardForm();
    setAddCardOpen(false);
    refresh();
  }

  function handleEditCard() {
    if (!editCard) return;
    if (!cUser.trim()) {
      toast.error('اسم المستخدم / الرقم مطلوب');
      return;
    }
    updateNetCard(editCard.id, {
      label: cLabel.trim() || undefined,
      username: cUser.trim(),
      password: cPass,
    });
    toast.success('تم تحديث البطاقة');
    setEditCard(null);
    resetCardForm();
    refresh();
  }

  function openEditPayee(p: SavedPayee) {
    setPName(p.name);
    setPNumber(p.number);
    setPMethod(p.method);
    setEditPayee(p);
  }

  function openEditCard(c: SavedNetCard) {
    setCLabel(c.label ?? '');
    setCUser(c.username);
    setCPass(c.password);
    setEditCard(c);
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

  const paymentTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handlePaymentTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = index === 0 ? 1 : 0;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    const nextTab = next === 0 ? 'pay' : 'cards';
    setTab(nextTab);
    paymentTabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-6">
      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-strong dark:text-warning">
          <WifiOff className="h-4 w-4 shrink-0" />
          أنت دون اتصال — المحفوظات متاحة من جهازك بدون نت.
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        أضف جهات الدفع وبطاقات النت يدويًا هنا. البيانات تُحفظ على جهازك فقط ويمكن تعديلها أو البحث عنها.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'pay' ? 'بحث في جهات الدفع…' : 'بحث في البطاقات…'}
          className="h-11 ps-10"
          aria-label="بحث في المحفوظات"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border p-1" role="tablist" aria-label="نوع المحفوظات">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pay'}
          tabIndex={tab === 'pay' ? 0 : -1}
          ref={(el) => { paymentTabRefs.current[0] = el; }}
          onKeyDown={(event) => handlePaymentTabKeyDown(event, 0)}
          onClick={() => setTab('pay')}
          className={cn(
            'flex min-h-[48px] items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition',
            tab === 'pay' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          <Banknote className="h-4 w-4" />
          جهات الدفع ({payees.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cards'}
          tabIndex={tab === 'cards' ? 0 : -1}
          ref={(el) => { paymentTabRefs.current[1] = el; }}
          onKeyDown={(event) => handlePaymentTabKeyDown(event, 1)}
          onClick={() => setTab('cards')}
          className={cn(
            'flex min-h-[48px] items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition',
            tab === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          <Wifi className="h-4 w-4" />
          بطاقات نت ({cards.length})
        </button>
      </div>

      {tab === 'pay' && (
        <section className="space-y-3">
          <Button type="button" className="w-full gap-2" size="lg" onClick={() => { resetPayForm(); setAddPayOpen(true); }}>
            <Plus className="h-4 w-4" />
            إضافة جهة دفع
          </Button>
          {filteredPayees.length === 0 ? (
            <EmptyState
              icon={<Banknote className="h-7 w-7" />}
              title={q ? 'لا نتائج لهذا البحث' : 'لا جهات محفوظة'}
              description={
                q
                  ? 'جرّب كلمة أخرى أو امسح البحث.'
                  : 'أضف رقمًا يدويًا — يُحفظ على جهازك ويعمل بدون نت.'
              }
            />
          ) : (
            <ul className="space-y-3">
              {filteredPayees.map((p) => (
                <li key={p.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {p.number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {PAY_METHOD_LABELS[p.method] ?? p.method}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="تعديل"
                        onClick={() => openEditPayee(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive"
                        aria-label="حذف"
                        onClick={() => setConfirmDeletePayee(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyBtn value={p.number} label="نسخ الرقم" />
                    {p.method !== 'bank' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setUssdAmount('');
                          setUssdPayee(p);
                        }}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        USSD
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
          <Button type="button" className="w-full gap-2" size="lg" onClick={() => { resetCardForm(); setAddCardOpen(true); }}>
            <Plus className="h-4 w-4" />
            إضافة بطاقة نت
          </Button>
          {filteredCards.length === 0 ? (
            <EmptyState
              icon={<Wifi className="h-7 w-7" />}
              title={q ? 'لا نتائج لهذا البحث' : 'لا بطاقات محفوظة'}
              description={
                q
                  ? 'جرّب كلمة أخرى أو امسح البحث.'
                  : 'أضف بطاقة يدويًا — تُحفظ محليًا وتعمل بدون نت.'
              }
            />
          ) : (
            <ul className="space-y-3">
              {filteredCards.map((c) => (
                <li key={c.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.label || 'بطاقة نت'}</p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {c.username}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        aria-label="تعديل"
                        onClick={() => openEditCard(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-destructive"
                        aria-label="حذف"
                        onClick={() => setConfirmDeleteCard(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyBtn value={c.username} label="نسخ المستخدم" />
                    {c.password ? <CopyBtn value={c.password} label="نسخ كلمة السر" /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* إضافة جهة */}
      <Dialog open={addPayOpen} onOpenChange={setAddPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة جهة دفع</DialogTitle>
            <DialogDescription>تُحفظ محليًا على جهازك — بدون رفع للسيرفر.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input aria-label="اسم جهة الدفع" placeholder="الاسم" value={pName} onChange={(e) => setPName(e.target.value)} />
            <Input aria-label="رقم جهة الدفع" placeholder="الرقم" value={pNumber} onChange={(e) => setPNumber(e.target.value)} dir="ltr" />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pMethod}
              onChange={(e) => setPMethod(e.target.value as PayMethod)}
            >
              <option value="jawwal">جوال بي</option>
              <option value="palpay">بال بي</option>
              <option value="bank">بنك / تحويل</option>
            </select>
            <Button type="button" className="w-full" onClick={handleAddPay}>
              حفظ الجهة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تعديل جهة */}
      <Dialog
        open={!!editPayee}
        onOpenChange={(o) => {
          if (!o) {
            setEditPayee(null);
            resetPayForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل جهة دفع</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input aria-label="اسم جهة الدفع" placeholder="الاسم" value={pName} onChange={(e) => setPName(e.target.value)} />
            <Input aria-label="رقم جهة الدفع" placeholder="الرقم" value={pNumber} onChange={(e) => setPNumber(e.target.value)} dir="ltr" />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pMethod}
              onChange={(e) => setPMethod(e.target.value as PayMethod)}
            >
              <option value="jawwal">جوال بي</option>
              <option value="palpay">بال بي</option>
              <option value="bank">بنك / تحويل</option>
            </select>
            <Button type="button" className="w-full" onClick={handleEditPay}>
              حفظ التعديلات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* إضافة بطاقة */}
      <Dialog open={addCardOpen} onOpenChange={setAddCardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة بطاقة نت</DialogTitle>
            <DialogDescription>تُحفظ محليًا — بدون رفع للسيرفر.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input aria-label="وصف البطاقة اختياري" placeholder="وصف (اختياري)" value={cLabel} onChange={(e) => setCLabel(e.target.value)} />
            <Input aria-label="اسم المستخدم أو الرقم" placeholder="اسم المستخدم / الرقم" value={cUser} onChange={(e) => setCUser(e.target.value)} dir="ltr" />
            <Input aria-label="كلمة السر" placeholder="كلمة السر" value={cPass} onChange={(e) => setCPass(e.target.value)} dir="ltr" />
            <Button type="button" className="w-full" onClick={handleAddCard}>
              حفظ البطاقة
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تعديل بطاقة */}
      <Dialog
        open={!!editCard}
        onOpenChange={(o) => {
          if (!o) {
            setEditCard(null);
            resetCardForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل بطاقة نت</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input aria-label="وصف البطاقة اختياري" placeholder="وصف (اختياري)" value={cLabel} onChange={(e) => setCLabel(e.target.value)} />
            <Input aria-label="اسم المستخدم أو الرقم" placeholder="اسم المستخدم / الرقم" value={cUser} onChange={(e) => setCUser(e.target.value)} dir="ltr" />
            <Input aria-label="كلمة السر" placeholder="كلمة السر" value={cPass} onChange={(e) => setCPass(e.target.value)} dir="ltr" />
            <Button type="button" className="w-full" onClick={handleEditCard}>
              حفظ التعديلات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* USSD */}
      <Dialog open={!!ussdPayee} onOpenChange={(o) => !o && setUssdPayee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>دفع USSD — {ussdPayee?.name}</DialogTitle>
            <DialogDescription dir="ltr">{ussdPayee?.number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="المبلغ بالشيكل"
              aria-label="المبلغ بالشيكل"
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

      <ConfirmDialog
        open={confirmDeletePayee !== null}
        onOpenChange={(o) => { if (!o) setConfirmDeletePayee(null); }}
        title={`حذف جهة «${confirmDeletePayee?.name ?? ''}»؟`}
        description="لا يمكن التراجع. الرقم سيُحذف من هذا الجهاز."
        confirmLabel="حذف"
        destructive
        onConfirm={() => {
          if (!confirmDeletePayee) return;
          removePayee(confirmDeletePayee.id);
          toast.success('تم الحذف');
          setConfirmDeletePayee(null);
          refresh();
        }}
      />

      <ConfirmDialog
        open={confirmDeleteCard !== null}
        onOpenChange={(o) => { if (!o) setConfirmDeleteCard(null); }}
        title={`حذف بطاقة «${confirmDeleteCard?.label || confirmDeleteCard?.username || ''}»؟`}
        description="لا يمكن التراجع. اسم المستخدم وكلمة السر سيُحذفان من هذا الجهاز."
        confirmLabel="حذف"
        destructive
        onConfirm={() => {
          if (!confirmDeleteCard) return;
          removeNetCard(confirmDeleteCard.id);
          toast.success('تم الحذف');
          setConfirmDeleteCard(null);
          refresh();
        }}
      />
    </div>
  );
}
