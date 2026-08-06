import { z } from 'zod';
import { UserActivityType } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => (value === undefined ? undefined : Number(value)), schema.optional());

// Gap #10: the frontend's filter tabs (الكل/الإعلانات/المنتجات/الخدمات/
// المتاجر/الرسائل/الطلبات/الحساب) are coarser than the 22 underlying
// UserActivityType values — one tab maps to several types. Kept here
// (not just in the frontend) so the query contract — "group is one of
// these 8 strings" — is validated and owned in one place, the same way
// savedSearchFiltersSchema owns its own filter shape rather than
// leaving it implicit. activity.service.ts's GROUP_TYPES is the
// single source of truth this validates against at the type level;
// this schema only needs to know the group *names*.
export const ACTIVITY_GROUPS = [
  'ALL',
  'ADS',
  'PRODUCTS',
  'SERVICES',
  'STORES',
  'MESSAGES',
  'REQUESTS',
  'ACCOUNT',
] as const;

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

export const getMyActivitySchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    // Fine-grained filter — an exact UserActivityType (e.g.
    // AD_CREATED). Mutually additive with `group` (both may be sent;
    // the repository ANDs them), though the frontend only ever sends
    // one at a time in practice.
    type: z.nativeEnum(UserActivityType).optional(),
    // Coarse filter matching the frontend's tab bar — see
    // ACTIVITY_GROUPS above. 'ALL' is accepted but treated identically
    // to omitting group entirely (no WHERE clause narrowing), kept as
    // a valid value so the frontend can always send its currently
    // selected tab without a special case for the default one.
    group: z.enum(ACTIVITY_GROUPS).optional(),
    // Free-text search over title/description — e.g. "iPhone" to find
    // every activity row that mentions it, regardless of type. Optional
    // per the task's "if appropriate" — genuinely useful once a user's
    // timeline has hundreds of rows across a dozen ads/products.
    q: z.string().trim().min(1).max(200).optional(),
  }),
});

export type GetMyActivityQuery = z.infer<typeof getMyActivitySchema>['query'];
