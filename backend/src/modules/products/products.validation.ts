import { z } from 'zod';
import { ProductAvailability, ProductStatus } from '@prisma/client';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

const productAttributesSchema = z.preprocess(
  value => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  },
  z.record(z.union([z.string().max(500), z.number().finite(), z.boolean()])),
);

export const createProductSchema = z.object({
  body: z.object({
    categoryId: z.string().min(1, 'categoryId is required'),
    name: z.string().min(2, 'Product name must be at least 2 characters').max(200),
    description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
    price: z.coerce
      .number()
      .positive('Price must be a positive number')
      .multipleOf(0.01, 'Price cannot have more than 2 decimal places'),
    discountPrice: z.coerce
      .number()
      .positive()
      .multipleOf(0.01)
      .optional(),
    wholesalePrice: z.coerce.number().positive().multipleOf(0.01).optional(),
    wholesaleMinQty: z.coerce.number().int().positive().optional(),
    availability: z.nativeEnum(ProductAvailability).default('IN_STOCK'),
    stockQuantity: z.coerce.number().int().min(0).max(1000000).optional(),
    attributes: productAttributesSchema.optional(),
  })
    // Wholesale pricing is a pair — a minimum quantity with no price
    // (or vice versa) is a contradiction, not a valid partial state.
    .refine(
      data =>
        (data.wholesalePrice === undefined) === (data.wholesaleMinQty === undefined),
      {
        message: 'wholesalePrice and wholesaleMinQty must be provided together',
        path: ['wholesalePrice'],
      }
    )
    .refine(data => data.discountPrice === undefined || data.discountPrice < data.price, {
      message: 'discountPrice must be less than price',
      path: ['discountPrice'],
    }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>['body'];

export const updateProductSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    categoryId: z.string().min(1).optional(),
    name: z.string().min(2).max(200).optional(),
    description: z.string().min(10).max(2000).optional(),
    price: z.coerce.number().positive().multipleOf(0.01).optional(),
    discountPrice: z.coerce.number().positive().multipleOf(0.01).nullable().optional(),
    wholesalePrice: z.coerce.number().positive().multipleOf(0.01).nullable().optional(),
    wholesaleMinQty: z.coerce.number().int().positive().nullable().optional(),
    availability: z.nativeEnum(ProductAvailability).optional(),
    stockQuantity: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
    attributes: productAttributesSchema.optional(),
    status: z.nativeEnum(ProductStatus).optional(),
  }),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];

export const PRODUCT_SORT_FIELDS = ['createdAt', 'price', 'views'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const getProductsSchema = z.object({
  query: z
    .object({
      page: optionalQueryNumber(z.number().int().min(1).max(1000)),
      limit: optionalQueryNumber(z.number().int().min(1).max(100)),
      categoryId: z.string().optional(),
      storeId: z.string().optional(),
      city: z.string().max(100).optional(),
      availability: z.nativeEnum(ProductAvailability).optional(),
      minPrice: optionalQueryNumber(z.number().min(0)),
      maxPrice: optionalQueryNumber(z.number().min(0)),
      search: z.string().min(1).max(200).optional(),
      sortBy: z.enum(PRODUCT_SORT_FIELDS).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
      // PROMO-1 (Phase 10 scope only — minimal, not the full Phase 12
      // filter design): true returns only products carrying a live
      // (SCHEDULED or ACTIVE) Promotion row, so the Home "عروض مميزة"
      // section can query directly instead of over-fetching and
      // filtering client-side. Query-string booleans arrive as the
      // string "true"/"false", same coercion products.controller.ts's
      // callers already rely on elsewhere in this schema.
      hasPromotion: z
        .preprocess(value => (value === undefined ? undefined : value === 'true'), z.boolean().optional()),
    })
    // FIX M-024: see ads.validation.ts's getAdsSchema refine for the
    // same fix and rationale — same silent-empty-result bug here.
    .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
      message: 'minPrice must not exceed maxPrice',
      path: ['minPrice'],
    }),
});

export type GetProductsQuery = z.infer<typeof getProductsSchema>['query'];

export const getMyProductsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    status: z.nativeEnum(ProductStatus).optional(),
    availability: z.nativeEnum(ProductAvailability).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  }),
});

export type GetMyProductsQuery = z.infer<typeof getMyProductsSchema>['query'];


export const productIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Product ID is required') }),
});

// FIX PRODUCTS-INLINE-ZOD: two Zod schemas were defined inline in
// products.controller.ts (mirroring ads.controller.ts's own inline
// shape) instead of living here with every other schema in this
// module. Beyond consistency, the inline versions had no upper bound
// on the array size, so a client could send an images array with
// arbitrarily many URLs — a small but real DoS surface, and one that
// cannot be caught by tests that load the validation module.
//
// Cap chosen to match the module's own MAX_IMAGES_PER_ENTITY (10) —
// a reorder must be a permutation of the entity's current images, so
// any list longer than the cap is necessarily invalid and can be
// rejected at the edge.
export const removeProductImageSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    imageUrl: z.string().url(),
  }),
});

export const reorderProductImagesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    images: z.array(z.string().url()).min(1).max(20),
  }),
});

export type RemoveProductImageInput = z.infer<typeof removeProductImageSchema>['body'];
export type ReorderProductImagesInput = z.infer<typeof reorderProductImagesSchema>['body'];
