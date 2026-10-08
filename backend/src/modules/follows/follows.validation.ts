import { z } from 'zod';
import { FollowTargetType } from '@prisma/client';

export const targetTypeSchema = z.nativeEnum(FollowTargetType);

export const toggleFollowSchema = z.object({
  body: z.object({
    targetType: targetTypeSchema,
    targetId: z.string().min(1).max(100),
  }),
});

export const followTargetSchema = z.object({
  params: z.object({ targetType: targetTypeSchema, targetId: z.string().min(1).max(100) }),
});

export const userIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

export const followListQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: targetTypeSchema.optional(),
  }),
});

export type ToggleFollowInput = z.infer<typeof toggleFollowSchema>['body'];
