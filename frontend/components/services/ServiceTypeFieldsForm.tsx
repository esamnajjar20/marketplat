'use client';

import { Input } from '@/components/shared/ui/Input';
import { FormField } from '@/components/shared/forms/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import type { ServiceTypeField, ServiceTypeFieldScope } from '@/types/service.types';

interface Props {
  fields: ServiceTypeField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  getError?: (key: string) => string | undefined;
  scope?: ServiceTypeFieldScope;
  compact?: boolean;
}

export function ServiceTypeFieldsForm({ fields, values, onChange, getError, scope = 'LISTING', compact = false }: Props) {
  const listingFields = fields.filter((field) => field.scope === scope && field.isActive);
  if (listingFields.length === 0) return null;

  return (
    <div className={compact ? 'space-y-4' : 'space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs'}>
      <div>
        <h2 className="font-semibold">{scope === 'PROVIDER' ? 'معلومات التخصص' : 'تفاصيل إضافية'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{scope === 'PROVIDER' ? 'هذه المعلومات تظهر فقط لهذا المجال وتساعد العميل على تقييم خبرتك.' : 'هذه الحقول تختلف حسب نوع الخدمة وتساعد العملاء على فهم العرض بسرعة.'}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {listingFields.map((field) => {
          const error = getError?.(field.key);
          const value = values[field.key];
          const label = field.labelAr;
          const required = field.required;

          if (field.type === 'BOOLEAN') {
            return (
              <label key={field.id} className="flex min-h-10 items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <input type="checkbox" checked={value === true} onChange={(e) => onChange(field.key, e.target.checked)} />
                <span>{label}{required ? ' *' : ''}</span>
              </label>
            );
          }

          if (field.type === 'SELECT') {
            return (
              <FormField key={field.id} label={label} htmlFor={`service-field-${field.key}`} required={required} error={error}>
                <Select value={typeof value === 'string' ? value : ''} onValueChange={(v) => onChange(field.key, v)}>
                  <SelectTrigger id={`service-field-${field.key}`}><SelectValue placeholder={`اختر ${label}`} /></SelectTrigger>
                  <SelectContent>
                    {(field.options ?? []).map((option) => <SelectItem key={option.value} value={option.value}>{option.labelAr}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            );
          }

          if (field.type === 'MULTI_SELECT') {
            const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
            return (
              <div key={field.id} className="space-y-1.5 sm:col-span-2">
                <p className="text-sm font-medium">{label}{required ? ' *' : ''}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(field.options ?? []).map((option) => {
                    const checked = selected.includes(option.value);
                    return (
                      <label key={option.value} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <input type="checkbox" checked={checked} onChange={() => onChange(field.key, checked ? selected.filter((v) => v !== option.value) : [...selected, option.value])} />
                        {option.labelAr}
                      </label>
                    );
                  })}
                </div>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              </div>
            );
          }

          return (
            <FormField key={field.id} label={label} htmlFor={`service-field-${field.key}`} required={required} error={error}>
              {field.type === 'TEXTAREA' ? (
                <textarea
                  id={`service-field-${field.key}`}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : (
                <Input
                  id={`service-field-${field.key}`}
                  type={field.type === 'NUMBER' ? 'number' : 'text'}
                  value={value == null ? '' : String(value)}
                  onChange={(e) => onChange(field.key, field.type === 'NUMBER' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                />
              )}
            </FormField>
          );
        })}
      </div>
    </div>
  );
}
