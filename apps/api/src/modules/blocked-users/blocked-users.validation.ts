import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

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
