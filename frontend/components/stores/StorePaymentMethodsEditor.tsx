'use client';

/**
 * محرر طرق الدفع — يمكن إضافة أكثر من محفظة/بنك (نفس النوع أكثر من مرة).
 */

import { useState } from 'react';
import { Plus, Trash2, Banknote } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import {
  PRESET_PAYMENT_KINDS,
  newPaymentMethodId,
  presetLabel,
  type StorePaymentKind,
  type StorePaymentMethod,
} from '@/lib/storePaymentMethods';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  value: StorePaymentMethod[];
  onChange: (next: StorePaymentMethod[]) => void;
  title?: string;
}

export function StorePaymentMethodsEditor({ value, onChange, title = 'طرق الدفع المعروضة للزبائن' }: Props) {
  const [kind, setKind] = useState<StorePaymentKind>('jawwal');
  const [label, setLabel] = useState('جوال بي');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  function addMethod() {
    if (!accountNumber.trim()) {
      toast.error('أدخل رقم المحفظة أو الحساب');
      return;
    }
    // يُسمح بتكرار نفس النوع (محافظ متعددة)
    const sameKindCount = value.filter((m) => m.kind === kind).length;
    let resolvedLabel =
      kind === 'custom'
        ? label.trim() || 'طريقة دفع'
        : label.trim() || presetLabel(kind);
    if (kind !== 'custom' && sameKindCount > 0 && resolvedLabel === presetLabel(kind)) {
      resolvedLabel = `${presetLabel(kind)} (${sameKindCount + 1})`;
    }

    const entry: StorePaymentMethod = {
      id: newPaymentMethodId(),
      kind,
      label: resolvedLabel,
      accountName: accountName.trim() || resolvedLabel,
      accountNumber: accountNumber.trim(),
    };
    onChange([...value, entry]);
    setAccountName('');
    setAccountNumber('');
    toast.success(`تمت إضافة «${resolvedLabel}» — احفظ تعديلات المتجر`);
  }

  function remove(id: string) {
    onChange(value.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="h-4 w-4 text-primary" />
          {title}
          {value.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {value.length}
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          أضف أكثر من محفظة أو بنك. الزبون يرى كل الأسماء، وعند الضغط يظهر الرقم مع نسخ وحفظ وUSSD.
        </p>
      </div>

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((m, i) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <span className="me-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                  {m.label}
                </p>
                <p className="text-xs text-muted-foreground">{m.accountName}</p>
                <p className="font-mono text-sm" dir="ltr">
                  {m.accountNumber}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => remove(m.id)}
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          لا طرق بعد — أضف جوال بي أو بال بي أو بنك أو طريقة مخصصة.
        </p>
      )}

      <div className="space-y-3 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">إضافة طريقة جديدة</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_PAYMENT_KINDS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => {
                setKind(p.kind);
                setLabel(p.label);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                kind === p.kind ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setKind('custom');
              setLabel('');
            }}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium',
              kind === 'custom' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted',
            )}
          >
            مخصص
          </button>
        </div>

        {kind === 'custom' && (
          <Input
            aria-label="اسم الطريقة"
            placeholder="اسم الطريقة (مثال: تحويل ويسترن)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        <Input
          aria-label="اسم صاحب الحساب"
          placeholder="اسم صاحب الحساب (يظهر للزبون)"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <Input
          aria-label="رقم المحفظة أو الحساب"
          placeholder="رقم المحفظة أو الحساب"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          dir="ltr"
        />
        <Button type="button" variant="outline" className="w-full gap-2" onClick={addMethod}>
          <Plus className="h-4 w-4" />
          إضافة طريقة أخرى
        </Button>
      </div>
    </div>
  );
}
