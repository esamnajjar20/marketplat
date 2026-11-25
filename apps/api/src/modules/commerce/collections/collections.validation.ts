import { z } from 'zod';

export const createCollectionSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    description: z.string().max(500).optional(),
    imageUrl: z.string().url().optional(),
  }),
});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>['body'];

export const updateCollectionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>['body'];

export const collectionIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Collection ID is required') }),
});

// Store-scoped reorder — the full set of the owner's collection ids in
// their new display order, same shape products-reorder-style endpoints
// elsewhere in this codebase expect (one the whole ordered
// list, not N individual sortOrder ).
export const reorderCollectionsSchema = z.object({
  body: z.object({
    // Keep bulk reorder work bounded. 1,000 IDs fits comfortably within
    // the API's 50KB JSON body limit while preventing unbounded validation.
    orderedIds: z
      .array(z.string().min(1))
      .min(1, 'orderedIds must not be empty')
      .max(1000, 'At most 1,000 collections can be reordered at once'),
  }),
});

export type ReorderCollectionsInput = z.infer<typeof reorderCollectionsSchema>['body'];

export const collectionProductParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Collection ID is required'),
    productId: z.string().min(1, 'Product ID is required'),
  }),
});

export const storeIdParamSchema = z.object({
  params: z.object({ storeId: z.string().min(1, 'Store ID is required') }),
});

export const storeScopeQuerySchema = z.object({
  query: z.object({ storeId: z.string().min(1).optional() }),
});

export type StoreScopeQuery = z.infer<typeof storeScopeQuerySchema>['query'];
