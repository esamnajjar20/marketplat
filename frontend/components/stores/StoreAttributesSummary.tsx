'use client';

import { useStoreTypeFields } from '@/hooks/queries/useStoreTypes';
import { getStoreTypePresentation, type StoreAttributes, type StoreType, type StoreTypeField } from '@/types/store.types';
import { StoreDynamicFieldGrid } from '@/components/stores/StoreDynamicFields';

export function StoreAttributesSummary({ storeTypeId, attributes, presentation, fields: providedFields }: { storeTypeId: string; attributes?: StoreAttributes | null; presentation?: StoreType['presentation']; fields?: StoreTypeField[] }) {
  const { data: fetchedFields = [] } = useStoreTypeFields(storeTypeId, { enabled: !providedFields });
  const fields = providedFields ?? fetchedFields;
  if (!attributes || fields.length === 0) return null;
  const visible = fields.filter((field) => field.scope !== 'PRODUCT' && field.showOnPage !== false && attributes[field.key] !== undefined);
  if (visible.length === 0) return null;
  const page = getStoreTypePresentation({ presentation });

  return (
    <section className="mt-4 w-full max-w-2xl rounded-2xl border border-border/70 bg-card p-4 text-start shadow-sm" aria-labelledby="store-details-heading">
      <div className="mb-3">
        <h2 id="store-details-heading" className="text-sm font-bold">{page.page.details}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">معلومات إضافية يحددها صاحب المتجر</p>
      </div>
      <StoreDynamicFieldGrid fields={visible} attributes={attributes} mode="page" />
    </section>
  );
}
