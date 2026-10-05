'use client';

import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import type { ServiceListing, ServiceTypeField } from '@/types/service.types';

interface Props { listing: Pick<ServiceListing, 'serviceTypeId' | 'attributes'>; }

function displayValue(field: ServiceTypeField, value: unknown): string {
  if (field.type === 'BOOLEAN') return value === true ? 'نعم' : 'لا';
  if (field.type === 'MULTI_SELECT' && Array.isArray(value)) {
    const labels = new Map((field.options ?? []).map((option) => [option.value, option.labelAr]));
    return value.map((item) => labels.get(String(item)) ?? String(item)).join('، ');
  }
  if (field.type === 'SELECT') {
    return field.options?.find((option) => option.value === value)?.labelAr ?? String(value);
  }
  return String(value);
}

export function ServiceTypeAttributesDisplay({ listing }: Props) {
  const { data: serviceTypes } = useServiceTypes();
  const type = serviceTypes?.find((item) => item.id === listing.serviceTypeId);
  const attributes = listing.attributes ?? {};
  const rows = (type?.fields ?? []).filter((field) => field.scope === 'LISTING' && field.isActive && field.showOnPage && attributes[field.key] !== undefined && attributes[field.key] !== null && attributes[field.key] !== '');
  if (!type || rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
      <h2 className="mb-3 text-sm font-semibold">معلومات الخدمة</h2>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((field) => (
          <div key={field.id} className="rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{field.pageLabelAr || field.labelAr}</dt>
            <dd className="mt-0.5 text-sm font-medium">{displayValue(field, attributes[field.key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
