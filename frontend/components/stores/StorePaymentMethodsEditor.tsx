'use client';

/**
 * محرر طرق الدفع لصاحب المتجر — إعدادات المتجر.
 * خيارات جاهزة: جوال بي، بال بي، بنك فلسطين + إضافة طريقة مخصصة.
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

interface Props {
  value: StorePaymentMethod[];
  onChange: (next: StorePaymentMethod[]) => void;
}

export function StorePaymentMethodsEditor({ value, onChange }: Props) {
  const [kind, setKind] = useState<StorePaymentKind>('jawwal');
  const [label, setLabel] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  function addMethod() {
    if (!accountNumber.trim()) return;
    const resolvedLabel =
      kind === 'custom'
        ? label.trim() || 'طريقة دفع'
        : label.trim() || presetLabel(kind);
    const entry: StorePaymentMethod = {
      id: newPaymentMethodId(),
      kind,
      label: resolvedLabel,
      accountName: accountName.trim() || resolvedLabel,
      accountNumber: accountNumber.trim(),
    };
    onChange([...value, entry]);
    setLabel('');
    setAccountName('');
    setAccountNumber('');
  }

  function remove(id: string) {
    onChange(value.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="h-4 w-4 text-primary" />
          طرق الدفع المعروضة للزبائن
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          اختر جوال بي / بال بي / بنك فلسطين أو أضف طريقة خاصة بك. الزبون يرى الاسم ثم الرقم مع خيار USSD والحفظ.
        </p>
      </div>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="font-medium">{m.label}</p>
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
      )}

      <div className="space-y-3 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">إضافة طريقة</p>
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
            placeholder="اسم الطريقة (مثال: تحويل ويسترن)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        <Input
          placeholder="اسم صاحب الحساب"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <Input
          placeholder="الرقم / رقم الحساب"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          dir="ltr"
        />
        <Button type="button" variant="outline" className="w-full gap-2" onClick={addMethod}>
          <Plus className="h-4 w-4" />
          إضافة إلى قائمة المتجر
        </Button>
      </div>
    </div>
  );
}
