import { z } from 'zod';

// UNIFY-PAYMENTS: no local storePaymentMethodSchema here anymore — a
// service provider's payment methods are now just its parent seller's
// (sellers.validation.ts owns the one copy of this schema, since
// sellers.service.ts is the only place paymentMethods is ever written
// from). See ServiceProviderDetails' schema.prisma comment for why.

const dayScheduleSchema = z
  .object({
    open: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'open must be HH:mm'),
    close: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'close must be HH:mm'),
  })
  .nullable();

// services-design.md §3: { "sun": {"open":"09:00","close":"18:00"}, "mon": null, ... }
export const workingHoursSchema = z.object({
  sun: dayScheduleSchema,
  mon: dayScheduleSchema,
  tue: dayScheduleSchema,
  wed: dayScheduleSchema,
  thu: dayScheduleSchema,
  fri: dayScheduleSchema,
  sat: dayScheduleSchema,
});

export const createServiceProviderSchema = z.object({
  body: z.object({
    businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
    businessType: z.enum(['INDIVIDUAL', 'SMALL_BUSINESS']).default('INDIVIDUAL'),
    logoUrl: z.string().url('logoUrl must be a valid URL').optional(),
    description: z.string().min(10, 'Description must be at least 10 characters').max(1000),
    // FIX AREA-CITIES-DEDUP: previously a plain array with no
    // uniqueness constraint — a client could send the same city 30
    // times, storing a redundant array that the `has: city` filter
    // then queries against on every public discovery call. Normalized
    // to a Set at the edge so downstream code sees a distinct list.
    serviceAreaCities: z
      .array(z.string().min(1))
      .min(1, 'At least one service area city is required')
      .max(30, 'At most 30 service area cities')
      .transform((cities) => Array.from(new Set(cities))),
    workingHours: workingHoursSchema,
    contactPhone: z.string().min(6, 'contactPhone is required').max(30),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
});

export type CreateServiceProviderInput = z.infer<typeof createServiceProviderSchema>['body'];

export const updateServiceProviderSchema = z.object({
  body: z.object({
    businessName: z.string().min(2).max(100).optional(),
    businessType: z.enum(['INDIVIDUAL', 'SMALL_BUSINESS']).optional(),
    logoUrl: z.string().url('logoUrl must be a valid URL').optional(),
    description: z.string().min(10).max(1000).optional(),
    serviceAreaCities: z
      .array(z.string().min(1))
      .min(1)
      .max(30)
      .transform((cities) => Array.from(new Set(cities)))
      .optional(),
    workingHours: workingHoursSchema.optional(),
    contactPhone: z.string().min(6).max(30).optional(),
    availabilityStatus: z.enum(['AVAILABLE', 'BUSY', 'UNAVAILABLE']).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  }),
});

export type UpdateServiceProviderInput = z.infer<typeof updateServiceProviderSchema>['body'];

export const serviceProviderIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Service provider ID is required') }),
});

// Home discovery plan (Phase 1): public city/browse list — deliberately
// separate from nearbyServiceProvidersSchema below. /nearby is a real
// geographic radius search (lat/lng required); this is a plain
// paginated directory, same shape as getStoresSchema/getProductsSchema
// (city optional — omitted city just means "general/unfiltered"). No
// lat/lng here on purpose: mixing the two concepts into one query
// shape was the exact confusion the plan asked to avoid. GPS-based
// sorting for this endpoint, if ever added, is a separate future change.
export const getServiceProvidersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    city: z.string().max(100).optional(),
  }),
});

export type GetServiceProvidersQuery = z.infer<typeof getServiceProvidersSchema>['query'];

// services-design.md §11: nearby search — lat/lng required, radius optional
// (kilometers), defaulted and capped server-side to avoid pathological
// full-table Haversine scans.
export const nearbyServiceProvidersSchema = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().min(0.5).max(100).default(10),
    page: z.coerce.number().int().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export type NearbyServiceProvidersQuery = z.infer<typeof nearbyServiceProvidersSchema>['query'];

// FIX SP-ANALYTICS-QUERY-ZOD: the period query param was hand-parsed
// in the controller with an `as '7d' | '30d' | 'all'` cast — a
// TypeScript lie with no runtime enforcement, and inconsistent with
// every other query param in this module (which all go through Zod).
// Now validated at the edge like everything else.
export const serviceProviderAnalyticsQuerySchema = z.object({
  query: z.object({
    period: z.enum(['7d', '30d', 'all']).default('all'),
  }),
});

export type ServiceProviderAnalyticsQuery = z.infer<typeof serviceProviderAnalyticsQuerySchema>['query'];

export const serviceProviderServiceTypeIdSchema = z.object({
  params: z.object({ serviceTypeId: z.string().min(1, 'Service type ID is required') }),
});

export const updateServiceProviderServiceTypeSchema = z.object({
  params: z.object({ serviceTypeId: z.string().min(1, 'Service type ID is required') }),
  body: z.object({
    attributes: z.record(z.string(), z.unknown()).default({}),
    isActive: z.boolean().optional(),
  }).strict(),
});
