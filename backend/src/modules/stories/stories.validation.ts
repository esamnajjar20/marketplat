import { z } from 'zod';
import { StoryVisibility } from '@prisma/client';

export const createStorySchema = z.object({
  body: z.object({
    text: z.string().trim().max(500).optional().or(z.literal('')),
    background: z.string().trim().max(40).optional(),
    visibility: z.nativeEnum(StoryVisibility).default(StoryVisibility.FOLLOWERS),
  }),
});

export const storyIdSchema = z.object({ params: z.object({ id: z.string().min(1).max(100) }) });
export const userStorySchema = z.object({ params: z.object({ userId: z.string().min(1).max(100) }) });
export const storyListSchema = z.object({
  query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
});
