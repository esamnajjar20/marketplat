import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

// FEAT: PublicProfileHeader's "مراسلة" button starts a thread directly
// with a user, with no ad in context — adId stays the primary path
// (SellerCard), userId is the new alternative. serviceRequestId is a
// third alternative — a service request's own detail page starting a
// thread with the other party to that specific request. Exactly one
// of the three must be present; any other combination is a 400, not a
// silent fallback.
export const startConversationSchema = z.object({
  body: z
    .object({
      adId: z.string().min(1).optional(),
      userId: z.string().min(1).optional(),
      serviceRequestId: z.string().min(1).optional(),
      context: z.object({
        type: z.enum(['product', 'service']),
        id: z.string().min(1),
      }).optional(),
    })
    .refine(
      (data) => [data.adId, data.userId, data.serviceRequestId].filter(Boolean).length === 1,
      { message: 'Provide exactly one of adId, userId, or serviceRequestId' }
    ),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>['body'];

export const conversationIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Conversation ID is required') }),
});

export const getConversationsSchema = z.object({
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    /** include archived threads (default: exclude them) */
    includeArchived: z
      .preprocess(
        (v) => (v === undefined ? undefined : v === 'true' || v === true),
        z.boolean().optional()
      ),
    /** only archived */
    role: z.enum(['buying', 'selling']).optional(),
    archivedOnly: z
      .preprocess(
        (v) => (v === undefined ? undefined : v === 'true' || v === true),
        z.boolean().optional()
      ),
  }),
});

export type GetConversationsQuery = z.infer<typeof getConversationsSchema>['query'];

export const sendMessageSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      body: z.string().max(2000).optional(),
      imageUrl: z.string().url().optional(),
      audioUrl: z.string().url().optional(),
      fileUrl: z.string().url().optional(),
    })
    .refine(
      (d) => Boolean((d.body && d.body.trim().length > 0) || d.imageUrl || d.audioUrl),
      { message: 'Provide a non-empty body, imageUrl, or audioUrl' }
    ),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>['body'];

export const getMessagesSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    limit: optionalQueryNumber(z.number().int().min(1).max(100)),
    // Opaque base64url cursor produced by the messages endpoint.
    before: z.string().min(1).max(300).optional(),
  }),
});

export type GetMessagesQuery = z.infer<typeof getMessagesSchema>['query'];

export const deleteMessageSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Conversation ID is required'),
    messageId: z.string().min(1, 'Message ID is required'),
  }),
});


export const setConversationFlagsSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      pinned: z.boolean().optional(),
      archived: z.boolean().optional(),
      mutedUntil: z.union([z.string().datetime(), z.null()]).optional(),
    })
    .refine((d) => d.pinned !== undefined || d.archived !== undefined || d.mutedUntil !== undefined, {
      message: 'Provide a conversation setting',
    }),
});

export const typingSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    isTyping: z.boolean(),
  }),
});

export const messageMarkSchema = z.object({
  params: z.object({ id: z.string().min(1), messageId: z.string().min(1) }),
});

export const mediaQuerySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({ limit: optionalQueryNumber(z.number().int().min(1).max(100)) }),
});
