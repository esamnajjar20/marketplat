'use client';
import { useEffect, useRef } from 'react';

import { FormField } from '@/components/shared/forms/FormField';
import { Input } from '@/components/shared/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { useStoreTypeFields } from '@/hooks/queries/useStoreTypes';
import type { StoreAttributes } from '@/types/store.types';

interface Props {
  storeTypeId: string;
  value: StoreAttributes;
  onChange: (value: StoreAttributes) => void;
  errors?: Record<string, string[]>;
}

export function StoreDynamicFields({ storeTypeId, value, onChange, errors }: Props) {
  const { data: fields = [], isLoading } = useStoreTypeFields(storeTypeId);
  const previousTypeId = useRef(storeTypeId);
  useEffect(() => {
    if (previousTypeId.current === storeTypeId) return;
    previousTypeId.current = storeTypeId;
    onChange({});
  }, [storeTypeId, onChange]);

  if (isLoading || fields.length === 0) return null;

  function setValue(key: string, next: string | number | boolean | undefined) {
    const nextValue = { ...value };
    if (next === undefined || next === '') delete nextValue[key];
    else nextValue[key] = next;
    onChange(nextValue);
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">بيانات إضافية</h3>
        <p className="mt-1 text-xs text-muted-foreground">حقول خاصة بنوع متجرك.</p>
      </div>
      {fields.map((field) => {
        const error = errors?.[field.key]?.[0];
        const current = value[field.key];
        if (field.type === 'BOOLEAN') {
          return (
            <label key={field.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={current === true} onChange={(e) => setValue(field.key, e.target.checked)} />
              <span>{field.labelAr}{field.required ? ' *' : ''}</span>
              {error && <span className="text-xs text-destructive">{error}</span>}
            </label>
          );
        }
        if (field.type === 'SELECT') {
          return (
            <FormField key={field.id} label={field.labelAr} htmlFor={`store-field-${field.key}`} required={field.required} error={error}>
              <Select value={typeof current === 'string' ? current : ''} onValueChange={(v) => setValue(field.key, v)}>
                <SelectTrigger id={`store-field-${field.key}`}><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>{(field.options ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.labelAr}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          );
        }
        return (
          <FormField key={field.id} label={field.labelAr} htmlFor={`store-field-${field.key}`} required={field.required} error={error}>
            <Input
              id={`store-field-${field.key}`}
              type={field.type === 'NUMBER' ? 'number' : 'text'}
              inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
              value={current === undefined ? '' : String(current)}
              onChange={(e) => setValue(field.key, field.type === 'NUMBER' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value)}
            />
          </FormField>
        );
      })}
    </div>
  );
}
