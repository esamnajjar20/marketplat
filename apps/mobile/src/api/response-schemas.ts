import { z } from 'zod';
import {
  apiSuccessResponseSchema,
  emailSchema,
  marketplaceOrderStatusSchema,
  paginationMetaSchema,
  userRoleSchema,
} from '@marketplat/contracts';

/** Success envelope schemas intentionally allow forward-compatible additional backend fields. */
export const authUserResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: emailSchema,
  role: userRoleSchema,
}).passthrough();

const authDataSchema = z.object({
  user: authUserResponseSchema.optional(),
  tokens: z.object({
    accessToken: z.string().min(1).optional(),
    expiresIn: z.number().finite().positive().optional(),
  }).passthrough().optional(),
  csrfToken: z.string().optional(),
}).passthrough();

export const authEnvelopeResponseSchema = apiSuccessResponseSchema.extend({
  data: authDataSchema.extend({ user: authUserResponseSchema, tokens: z.object({ accessToken: z.string().min(1), expiresIn: z.number().finite().positive().optional() }).passthrough() }),
});

export const refreshEnvelopeResponseSchema = apiSuccessResponseSchema.extend({
  data: z.object({
    tokens: z.object({ accessToken: z.string().min(1), expiresIn: z.number().finite().positive().optional() }).passthrough(),
    csrfToken: z.string().optional(),
  }).passthrough(),
});

const criticalAdDataSchema = z.object({ id: z.string().min(1), title: z.string().min(1) }).passthrough();
export const criticalAdEnvelopeResponseSchema = apiSuccessResponseSchema.extend({ data: criticalAdDataSchema });

const criticalOrderDataSchema = z.object({
  id: z.string().min(1),
  status: marketplaceOrderStatusSchema,
  items: z.array(z.object({ id: z.string().min(1), quantity: z.number().finite().positive() }).passthrough()),
}).passthrough();
export const criticalOrderEnvelopeResponseSchema = apiSuccessResponseSchema.extend({ data: criticalOrderDataSchema });

export const criticalOrderListEnvelopeResponseSchema = apiSuccessResponseSchema.extend({ data: z.array(criticalOrderDataSchema) });

const optionalNullableString = z.string().nullable().optional();
const paginationResponseSchema = paginationMetaSchema;
const mobileApiMetaSchema = z.object({ pagination: paginationResponseSchema.optional() }).passthrough();

/** Minimal-but-runtime-checked contracts for high-volume messaging endpoints. */
export const chatUserResponseSchema = z.object({
  id: z.string().min(1),
  name: optionalNullableString,
  avatarUrl: optionalNullableString,
}).passthrough();

export const chatMessageResponseSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  senderId: z.string().min(1),
  body: optionalNullableString,
  imageUrl: optionalNullableString,
  audioUrl: optionalNullableString,
  fileUrl: optionalNullableString,
  fileName: optionalNullableString,
  fileMimeType: optionalNullableString,
  fileSize: z.number().finite().int().nonnegative().nullable().optional(),
  createdAt: z.string().min(1),
  deletedAt: optionalNullableString,
  isPinned: z.boolean().optional(),
  isStarredByMe: z.boolean().optional(),
  readAt: optionalNullableString,
  outboxAttempts: z.number().finite().int().nonnegative().optional(),
  outboxStatus: z.string().optional(),
  outboxLastError: optionalNullableString,
}).passthrough();

const conversationAdContextSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  images: z.array(z.string()).optional(),
}).passthrough();
const serviceListingContextSchema = z.object({
  title: z.string().optional(),
  images: z.array(z.string()).optional(),
}).passthrough();
const conversationResponseSchema = z.object({
  id: z.string().min(1),
  buyerId: z.string().min(1),
  sellerId: z.string().min(1),
  buyer: chatUserResponseSchema,
  seller: chatUserResponseSchema,
  ad: conversationAdContextSchema.nullable().optional(),
  serviceRequest: z.object({
    id: z.string().min(1),
    details: z.string().optional(),
    listing: serviceListingContextSchema.nullable().optional(),
  }).passthrough().nullable().optional(),
  lastMessage: chatMessageResponseSchema.nullable().optional(),
  unreadCount: z.number().finite().int().nonnegative().optional(),
  updatedAt: z.string().optional(),
  mySettings: z.object({
    pinnedAt: optionalNullableString,
    archivedAt: optionalNullableString,
    mutedUntil: optionalNullableString,
  }).passthrough().nullable().optional(),
}).passthrough();

const notificationResponseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string(),
  body: z.string(),
  data: z.unknown().optional(),
  isRead: z.boolean().optional(),
  readAt: optionalNullableString,
  createdAt: z.string().min(1),
}).passthrough();

function successEnvelopeResponseSchema(data: z.ZodTypeAny) {
  return apiSuccessResponseSchema.extend({ data, meta: mobileApiMetaSchema.optional() });
}

export const conversationListEnvelopeResponseSchema = successEnvelopeResponseSchema(z.array(conversationResponseSchema));
export const conversationEnvelopeResponseSchema = successEnvelopeResponseSchema(conversationResponseSchema);
export const chatMessageListEnvelopeResponseSchema = successEnvelopeResponseSchema(z.array(chatMessageResponseSchema));
export const chatMessageEnvelopeResponseSchema = successEnvelopeResponseSchema(chatMessageResponseSchema);
export const conversationCreatedEnvelopeResponseSchema = successEnvelopeResponseSchema(z.object({ id: z.string().min(1) }).passthrough());
export const notificationListEnvelopeResponseSchema = successEnvelopeResponseSchema(z.array(notificationResponseSchema));
export const unreadCountEnvelopeResponseSchema = successEnvelopeResponseSchema(z.object({
  count: z.union([
    z.number().finite().int().nonnegative(),
    z.string().regex(/^\d+$/),
  ]).transform((value) => typeof value === 'string' ? Number(value) : value),
}).passthrough());
