import { z } from 'zod';

export const favoriteAdSchema = z.object({
  params: z.object({ adId: z.string().min(1, 'Ad ID is required') }),
});

export const getFavoritesSchema = z.object({
  query: z.object({
    page: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform(Number)
      .pipe(z.number().min(1).max(1000).optional()),
    limit: z
      .string()
      .regex(/^\d+$/)
      .optional()
      .transform(Number)
      .pipe(z.number().min(1).max(100).optional()),
  }),
});

export type GetFavoritesQuery = z.infer<typeof getFavoritesSchema>['query'];
