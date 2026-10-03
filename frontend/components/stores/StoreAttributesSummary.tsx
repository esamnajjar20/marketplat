'use client';

import { useStoreTypeFields } from '@/hooks/queries/useStoreTypes';
import type { StoreAttributes } from '@/types/store.types';

export function StoreAttributesSummary({ storeTypeId, attributes }: { storeTypeId: string; attributes?: StoreAttributes | null }) {
  const { data: fields = [] } = useStoreTypeFields(storeTypeId);
  if (!attributes || fields.length === 0) return null;
  const visible = fields.filter((field) => attributes[field.key] !== undefined);
  if (visible.length === 0) return null;

  return (
    <div className="mt-4 w-full max-w-sm rounded-2xl border border-border/70 bg-card p-3.5 text-start shadow-sm">
      <h2 className="mb-2 text-sm font-semibold">معلومات المتجر</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {visible.map((field) => {
          const raw = attributes[field.key];
          const option = field.type === 'SELECT' ? field.options?.find((item) => item.value === raw) : null;
          const value = typeof raw === 'boolean' ? (raw ? 'نعم' : 'لا') : option?.labelAr ?? String(raw);
          return (
            <div key={field.id} className="min-w-0">
              <dt className="text-2xs-tight text-muted-foreground">{field.labelAr}</dt>
              <dd className="truncate text-sm font-medium">{value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
