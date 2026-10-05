'use client';

import { useEffect, useRef } from 'react';
import { Check, Circle, Info } from 'lucide-react';

import { FormField } from '@/components/shared/forms/FormField';
import { Input } from '@/components/shared/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { useStoreTypeFields } from '@/hooks/queries/useStoreTypes';
import type { StoreAttributes, StoreTypeField } from '@/types/store.types';
import { cn } from '@/lib/utils';

export function formatStoreFieldValue(field: StoreTypeField, value: StoreAttributes[string] | undefined): string {
  if (value === undefined || value === null) return '';
  if (field.type === 'BOOLEAN') return value === true ? 'نعم' : 'لا';
  if (field.type === 'SELECT') {
    return field.options?.find((option) => option.value === value)?.labelAr ?? String(value);
  }
  return String(value);
}

/**
 * Editable form for STORE-scoped fields only (PRODUCT-scoped fields are
 * edited on the ProductForm). Renders nothing when the store type has no
 * active STORE fields.
 */
export function StoreDynamicFields({
  storeTypeId,
  value,
  onChange,
  errors,
}: {
  storeTypeId: string;
  value: StoreAttributes;
  onChange: (value: StoreAttributes) => void;
  errors?: Record<string, string[]>;
}) {
  const { data: allFields = [], isLoading } = useStoreTypeFields(storeTypeId);
  const fields = allFields.filter((field) => (field.scope ?? 'STORE') !== 'PRODUCT');

  // Reset values when the store type changes so a different type's keys
  // do not linger in the attributes blob.
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
    <div dir="rtl" className="space-y-3 rounded-xl border bg-card p-4 text-right">
      <div className="flex items-start gap-3 text-right">
        <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
          <Info className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">بيانات إضافية</h3>
          <p className="mt-1 text-xs text-muted-foreground">حقول خاصة بنوع متجرك. الحقول المعلّمة بنجمة مطلوبة.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => {
        const error = errors?.[field.key]?.[0];
        const current = value[field.key];

        if (field.type === 'BOOLEAN') {
          return (
            <div key={field.id} className="rounded-lg border border-border/60 px-3 py-2.5 text-right">
            <label className="flex items-center gap-2 text-sm leading-6">
              <Checkbox
                checked={current === true}
                onChange={(e) => setValue(field.key, e.target.checked)}
              />
              <span>{field.labelAr}{field.required ? ' *' : ''}</span>
            </label>
            {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
            </div>
          );
        }

        if (field.type === 'SELECT') {
          return (
            <FormField key={field.id} label={field.labelAr} htmlFor={`store-field-${field.key}`} required={field.required} error={error}>
              <Select value={typeof current === 'string' ? current : ''} onValueChange={(v) => setValue(field.key, v)}>
                <SelectTrigger dir="rtl" id={`store-field-${field.key}`}><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.labelAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          );
        }

        return (
          <FormField key={field.id} label={field.labelAr} htmlFor={`store-field-${field.key}`} required={field.required} error={error}>
            <Input
              dir={field.type === 'NUMBER' ? 'ltr' : 'rtl'}
              id={`store-field-${field.key}`}
              type={field.type === 'NUMBER' ? 'number' : 'text'}
              inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
              value={current === undefined ? '' : String(current)}
              onChange={(e) =>
                setValue(
                  field.key,
                  field.type === 'NUMBER'
                    ? (e.target.value === '' ? undefined : Number(e.target.value))
                    : e.target.value,
                )
              }
            />
          </FormField>
        );
      })}
      </div>
    </div>
  );
}

export function StoreDynamicFieldGrid({
  fields,
  attributes,
  mode = 'page',
}: {
  fields: StoreTypeField[];
  attributes?: StoreAttributes | null;
  mode?: 'card' | 'page';
}) {
  if (!attributes) return null;
  const visible = fields
    .filter((field) => field.isActive !== false)
    .filter((field) => mode === 'card' ? field.showOnCard : field.showOnPage !== false)
    .filter((field) => attributes[field.key] !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!visible.length) return null;

  return (
    <div className={cn(
      'grid gap-2',
      mode === 'card' ? 'grid-cols-1 min-[380px]:grid-cols-2' : 'grid-cols-1 md:grid-cols-2',
    )}>
      {visible.map((field) => {
        const value = attributes[field.key];
        const label = mode === 'card' ? (field.cardLabelAr || field.labelAr) : (field.pageLabelAr || field.labelAr);
        return (
          <div key={field.id} className={cn(
            'min-w-0 rounded-xl border px-3 py-2.5 text-right',
            mode === 'card' ? 'border-border/60 bg-muted/35' : 'border-border/70 bg-card',
          )}>
            <p className="break-words text-[11px] leading-5 text-muted-foreground">{label}</p>
            <p className="mt-0.5 break-words text-sm font-semibold leading-6 text-foreground">{formatStoreFieldValue(field, value)}</p>
          </div>
        );
      })}
    </div>
  );
}

export function StoreDynamicFieldChips({
  fields,
  attributes,
}: {
  fields: StoreTypeField[];
  attributes?: StoreAttributes | null;
}) {
  if (!attributes) return null;
  const visible = fields
    .filter((field) => field.isActive !== false && field.showOnCard)
    .filter((field) => attributes[field.key] !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 3);

  if (!visible.length) return null;

  return (
    <div dir="rtl" className="flex flex-wrap gap-1.5 text-right">
      {visible.map((field) => (
        <span key={field.id} className="inline-flex max-w-full items-start gap-1 rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-[11px] leading-5 text-muted-foreground">
          {field.type === 'BOOLEAN' ? (attributes[field.key] === true ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />) : null}
          <span className="min-w-0 break-words">{field.cardLabelAr || field.labelAr}: {formatStoreFieldValue(field, attributes[field.key])}</span>
        </span>
      ))}
    </div>
  );
}
