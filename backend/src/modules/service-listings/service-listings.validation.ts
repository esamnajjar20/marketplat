import { z } from 'zod';
import { ServicePricingType, ServiceLocationType, ServiceListingStatus } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

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
  query: z.object({
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
  }),
});

export type GetServiceListingsQuery = z.infer<typeof getServiceListingsSchema>['query'];

export const serviceListingIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Service listing ID is required') }),
});
