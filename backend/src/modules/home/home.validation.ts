import { z } from 'zod';

/**
 * Cities the homepage accepts for its `city` filter. Mirrors the fixed
 * 10-city list the frontend sends (frontend/lib/constants.ts → CITIES).
 *
 * Why an allow-list: /home is served with a public Cache-Control, so the
 * `city` value is part of the CDN cache key. Accepting any 100-char string
 * let a client fragment the cache with arbitrary values (and fan out
 * 12 DB queries per unique value). An unknown city is treated as "no city"
 * (general results) instead of failing the whole request.
 */
export const HOME_CITIES = [
  'غزة',
  'خان يونس',
  'رفح',
  'دير البلح',
  'بيت لاهيا',
  'بيت حانون',
  'جباليا',
  'النصيرات',
  'المغازي',
  'البريج',
] as const;

const HOME_CITY_SET: ReadonlySet<string> = new Set(HOME_CITIES);

/**
 * GET /home — aggregates above-the-fold and static below-the-fold
 * homepage sections into one round trip.
 *
 * `city` optional: ads + products/stores/services/providers city variants.
 *
 * NOT included: personalized recommendations (public Cache-Control).
 */
export const getHomepageSchema = z.object({
  query: z.object({
    city: z
      .string()
      .max(100)
      .optional()
      .transform((value) => {
        // FIX HOME-CITY-EXPLICIT-ALL: __ALL__ is a client sentinel meaning
        // "user explicitly chose all cities". It must survive the transform
        // so the service can distinguish it from "no param sent" (which
        // triggers the profile-city fallback). Everything else unknown still
        // becomes undefined (blocks cache fragmentation).
        if (value === '__ALL__') return '__ALL__';
        const normalized = value?.trim().replace(/\s+/g, ' ');
        return normalized && HOME_CITY_SET.has(normalized) ? normalized : undefined;
      }),
  }),
});

export type GetHomepageQuery = z.infer<typeof getHomepageSchema>['query'];
