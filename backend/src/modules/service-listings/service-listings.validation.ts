import { z } from 'zod';
import { ServicePricingType, ServiceLocationType, ServiceListingStatus } from '@prisma/client';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

export const createServiceListingSchema = z.object({
  body: z.object({
    categoryId: z.string().min(1, 'categoryId is required'),
    title: z.string().min(3, 'Title must be at least 3 characters').max(200),
    description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
    pricingType: z.nativeEnum(ServicePricingType).default('NEGOTIABLE'),
    price: z.coerce
      .number()
      .positive('Price must be a positive number')
      .multipleOf(0.01, 'Price cannot have more than 2 decimal places')
      .optional(),
    durationEstimate: z.string().max(100).optional(),
    serviceLocation: z.nativeEnum(ServiceLocationType).default('AT_PROVIDER'),
  }),
});

export type CreateServiceListingInput = z.infer<typeof createServiceListingSchema>['body'];

export const updateServiceListingSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    categoryId: z.string().min(1).optional(),
    title: z.string().min(3).max(200).optional(),
    description: z.string().min(10).max(2000).optional(),
    pricingType: z.nativeEnum(ServicePricingType).optional(),
    price: z.coerce.number().positive().multipleOf(0.01).nullable().optional(),
    durationEstimate: z.string().max(100).nullable().optional(),
    serviceLocation: z.nativeEnum(ServiceLocationType).optional(),
    status: z.nativeEnum(ServiceListingStatus).optional(),
  }),
});

export type UpdateServiceListingInput = z.infer<typeof updateServiceListingSchema>['body'];

export const SERVICE_LISTING_SORT_FIELDS = ['createdAt', 'price', 'views'] as const;
export type ServiceListingSortField = (typeof SERVICE_LISTING_SORT_FIELDS)[number];

export const getServiceListingsSchema = z.object({
  query: z
    .object({
      page: optionalQueryNumber(z.number().int().min(1).max(1000)),
      limit: optionalQueryNumber(z.number().int().min(1).max(100)),
      categoryId: z.string().optional(),
      providerId: z.string().optional(),
      city: z.string().max(100).optional(),
      serviceLocation: z.nativeEnum(ServiceLocationType).optional(),
      minPrice: optionalQueryNumber(z.number().min(0)),
      maxPrice: optionalQueryNumber(z.number().min(0)),
      search: z.string().min(1).max(200).optional(),
      sortBy: z.enum(SERVICE_LISTING_SORT_FIELDS).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      /** Owner-only filter for GET /service-listings/me */
      status: z.nativeEnum(ServiceListingStatus).optional(),
    })
    // FIX M-024: see ads.validation.ts's getAdsSchema refine for the
    // same fix and rationale — same silent-empty-result bug here.
    .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
      message: 'minPrice must not exceed maxPrice',
      path: ['minPrice'],
    }),
});

export type GetServiceListingsQuery = z.infer<typeof getServiceListingsSchema>['query'];

export const serviceListingIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Service listing ID is required') }),
});

// FIX SL-INLINE-ZOD: two Zod schemas were defined inline in
// service-listings.controller.ts (mirroring the products/ads
// controllers' own inline shape). Both now live here with every other
// schema in this module, and the reorder schema has an explicit
// max(20) cap — previously unbounded, so a client could send an
// arbitrarily long images array as a small DoS surface that no unit
// test of the validation module could catch. Same fix products got.
export const removeServiceListingImageSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    imageUrl: z.string().url(),
  }),
});

export const reorderServiceListingImagesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    images: z.array(z.string().url()).min(1).max(20),
  }),
});

export type RemoveServiceListingImageInput = z.infer<typeof removeServiceListingImageSchema>['body'];
export type ReorderServiceListingImagesInput = z.infer<typeof reorderServiceListingImagesSchema>['body'];
