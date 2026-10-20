/**
 * Dynamic category attributes for filters (Phase 3 design).
 *
 * Backend direction (future migration):
 *   Category.attributeSchema Json?  // array of AttributeDef
 *   Ad.attributes Json?             // Record<string, string | number | boolean>
 *
 * Until the migration lands, the frontend can use a static map for
 * high-traffic categories (cars, real-estate, electronics) as a pilot.
 *
 * Query param convention (URL):
 *   attr.<key>=<value>   e.g. attr.brand=Samsung&attr.year=2020
 * Backend search.validation will need to accept passthrough attr.* or
 * a single attributes JSON blob once implemented.
 */

export type AttributeControlType = 'select' | 'number' | 'boolean' | 'text';

export interface AttributeDef {
  key: string;
  labelAr: string;
  type: AttributeControlType;
  /** For select */
  options?: { value: string; labelAr: string }[];
  min?: number;
  max?: number;
  /** Only show when search type matches */
  types?: Array<'ads' | 'products' | 'services'>;
}

/** Pilot static schemas — replace with API-driven data later. */
export const CATEGORY_ATTRIBUTE_SCHEMAS: Record<string, AttributeDef[]> = {
  // Example keys — replace with real category UUIDs from your DB
  // 'cat_cars_uuid': [
  //   { key: 'make', labelAr: 'الشركة', type: 'select', options: [...] },
  //   { key: 'year', labelAr: 'سنة الصنع', type: 'number', min: 1990, max: 2027 },
  // ],
};

export function getAttributeSchema(categoryId: string | undefined): AttributeDef[] {
  if (!categoryId) return [];
  return CATEGORY_ATTRIBUTE_SCHEMAS[categoryId] ?? [];
}

/** Read attr.* from URLSearchParams into a plain object. */
export function parseAttributesFromParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((value, key) => {
    if (key.startsWith('attr.') && value) {
      out[key.slice(5)] = value;
    }
  });
  return out;
}

/** Write attributes into URLSearchParams (mutates). */
export function writeAttributesToParams(
  params: URLSearchParams,
  attrs: Record<string, string | undefined>,
): void {
  // Remove existing attr.*
  const toDelete: string[] = [];
  params.forEach((_, key) => {
    if (key.startsWith('attr.')) toDelete.push(key);
  });
  toDelete.forEach((k) => params.delete(k));

  for (const [key, value] of Object.entries(attrs)) {
    if (value != null && value !== '') {
      params.set(`attr.${key}`, value);
    }
  }
}
