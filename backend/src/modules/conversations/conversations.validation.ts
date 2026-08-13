import { z } from 'zod';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

// FEAT: PublicProfileHeader's "مراسلة" button starts a thread directly
// with a user, with no ad in context — adId stays the primary path
// (SellerCard), userId is the new alternative. Exactly one of the two
// must be present; both or neither is a 400, not a silent fallback.
export const startConversationSchema = z.object({
  body: z
    .object({
      adId: z.string().min(1).optional(),
      userId: z.string().min(1).optional(),
    })
    .refine((data) => Boolean(data.adId) !== Boolean(data.userId), {
      message: 'Provide exactly one of adId or userId',
    }),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>['body'];

export const conversationIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Conversation ID is required') }),
});

export const getConversationsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetConversationsQuery = z.infer<typeof getConversationsSchema>['query'];

export const sendMessageSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    body: z.string().min(1, 'Message cannot be empty').max(2000),
  }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>['body'];

export const getMessagesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
  }),
});

export type GetMessagesQuery = z.infer<typeof getMessagesSchema>['query'];

export const deleteMessageSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Conversation ID is required'),
    messageId: z.string().min(1, 'Message ID is required'),
  }),
});
