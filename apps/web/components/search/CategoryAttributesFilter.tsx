'use client';

/**
 * Renders dynamic attribute controls when the active category has a schema.
 * Phase 3 pilot — no-op when CATEGORY_ATTRIBUTE_SCHEMAS is empty.
 *
 * Place at: apps/web/components/search/CategoryAttributesFilter.tsx
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/shared/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';
import { ROUTES } from '@/lib/constants';
import {
  getAttributeSchema,
  parseAttributesFromParams,
  writeAttributesToParams,
  type AttributeDef,
} from '@/types/categoryAttributes';

interface Props {
  categoryId?: string;
  /** When true, only update local draft via callback (sheet mode). */
  draftMode?: boolean;
  draftAttrs?: Record<string, string>;
  onDraftChange?: (attrs: Record<string, string>) => void;
}

export function CategoryAttributesFilter({
  categoryId,
  draftMode,
  draftAttrs,
  onDraftChange,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const schema = getAttributeSchema(categoryId);

  if (!schema.length) return null;

  const current = draftMode
    ? (draftAttrs ?? {})
    : parseAttributesFromParams(new URLSearchParams(sp.toString()));

  function setAttr(def: AttributeDef, value: string | undefined) {
    const next = { ...current };
    if (value == null || value === '' || value === 'ALL') delete next[def.key];
    else next[def.key] = value;

    if (draftMode) {
      onDraftChange?.(next);
      return;
    }

    const params = new URLSearchParams(sp.toString());
    params.delete('page');
    writeAttributesToParams(params, next);
    const q = params.toString();
    router.replace(q ? `${ROUTES.search}?${q}` : ROUTES.search);
  }

  return (
    <section className="space-y-3" aria-label="خصائص الفئة">
      <h3 className="text-sm font-semibold">خصائص إضافية</h3>
      {schema.map((def) => (
        <div key={def.key} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{def.labelAr}</label>
          {def.type === 'select' && (
            <Select
              value={current[def.key] || 'ALL'}
              onValueChange={(v) => setAttr(def, v === 'ALL' ? undefined : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">الكل</SelectItem>
                {def.options?.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.labelAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {def.type === 'number' && (
            <Input
              type="number"
              inputMode="numeric"
              min={def.min}
              max={def.max}
              value={current[def.key] ?? ''}
              onChange={(e) => setAttr(def, e.target.value || undefined)}
              placeholder={def.labelAr}
            />
          )}
          {def.type === 'text' && (
            <Input
              type="text"
              value={current[def.key] ?? ''}
              onChange={(e) => setAttr(def, e.target.value || undefined)}
              placeholder={def.labelAr}
            />
          )}
          {def.type === 'boolean' && (
            <Select
              value={current[def.key] || 'ALL'}
              onValueChange={(v) => setAttr(def, v === 'ALL' ? undefined : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="الكل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">الكل</SelectItem>
                <SelectItem value="true">نعم</SelectItem>
                <SelectItem value="false">لا</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
    </section>
  );
}
