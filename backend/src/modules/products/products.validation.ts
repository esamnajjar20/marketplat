import { z } from 'zod';
import { ProductAvailability, ProductStatus } from '@prisma/client';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

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
    status: z.nativeEnum(ProductStatus).optional(),
  }),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];

export const PRODUCT_SORT_FIELDS = ['createdAt', 'price', 'views'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const getProductsSchema = z.object({
  query: z.object({
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
  }),
});

export type GetProductsQuery = z.infer<typeof getProductsSchema>['query'];

export const productIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Product ID is required') }),
});
