import { z } from 'zod';

export const favoriteAdSchema = z.object({
  params: z.object({ adId: z.string().min(1, 'Ad ID is required') }),
});

export const getFavoritesSchema = z.object({
  query: z.object({
    // FIX BUG-FAV-01: .optional() previously sat on the *string* schema,
    // before .transform(Number) — so when the query param was absent
    // (the common case: GET /favorites with no page, or GET /favorites
    // with only limit set), Zod still ran .transform(Number) on the
    // `undefined` that passed through .optional(), producing NaN
    // instead of undefined. NaN then failed the piped z.number() check
    // (Zod's z.number() rejects NaN), so *any* request omitting page or
    // limit was rejected with a 400 — even though both fields are
    // meant to be optional. Moving .optional() to the very end (after
    // the pipe) means "absent" short-circuits before transform/pipe
    // ever run, matching the intended "these params are optional" design.
    page: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(1000))
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
  }),
});

export type GetFavoritesQuery = z.infer<typeof getFavoritesSchema>['query'];
