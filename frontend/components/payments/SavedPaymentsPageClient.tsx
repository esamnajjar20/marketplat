'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Banknote,
  Wifi,
  Trash2,
  Copy,
  Check,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import {
  listSavedPayees,
  removePayee,
  listSavedNetCards,
  removeNetCard,
  PAY_METHOD_LABELS,
  type SavedPayee,
  type SavedNetCard,
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

  const refresh = useCallback(() => {
    setPayees(listSavedPayees());
    setCards(listSavedNetCards());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
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
          {payees.length === 0 ? (
            <EmptyState
              icon={<Bookmark className="h-7 w-7" />}
              title="لا جهات دفع محفوظة"
              description="عند الدفع بالـ QR يمكنك حفظ الاسم والرقم لتظهر هنا."
            />
          ) : (
            <ul className="space-y-3">
              {payees.map((p) => (
                <li
                  key={p.id}
                  className="space-y-3 rounded-xl border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAY_METHOD_LABELS[p.method]}
                      </p>
                      <p className="mt-1 font-mono text-sm" dir="ltr">
                        {p.number}
                      </p>
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
                    <CopyBtn value={p.name} label="نسخ الاسم" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'cards' && (
        <section className="space-y-3">
          {cards.length === 0 ? (
            <EmptyState
              icon={<Wifi className="h-7 w-7" />}
              title="لا بطاقات محفوظة"
              description="من زر بطاقات نت يمكنك حفظ اسم المستخدم وكلمة السر هنا."
            />
          ) : (
            <ul className="space-y-3">
              {cards.map((c) => (
                <li key={c.id} className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.label || c.username}</p>
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">المستخدم: </span>
                        <span className="font-mono" dir="ltr">
                          {c.username}
                        </span>
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">كلمة السر: </span>
                        <span className="font-mono" dir="ltr">
                          {c.password}
                        </span>
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
