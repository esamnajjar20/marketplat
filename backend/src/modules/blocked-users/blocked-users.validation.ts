import { z } from 'zod';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

export const blockedUserIdSchema = z.object({
  params: z.object({ userId: z.string().min(1, 'User ID is required') }),
});

export const getBlockedUsersSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetBlockedUsersQuery = z.infer<typeof getBlockedUsersSchema>['query'];
