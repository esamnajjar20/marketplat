import { z } from 'zod';

/** Success envelope schemas intentionally allow forward-compatible additional backend fields. */
export const authUserResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
}).passthrough();

const authDataSchema = z.object({
  user: authUserResponseSchema.optional(),
  tokens: z.object({
    accessToken: z.string().min(1).optional(),
    expiresIn: z.number().finite().positive().optional(),
  }).passthrough().optional(),
  csrfToken: z.string().optional(),
}).passthrough();

export const authEnvelopeResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: authDataSchema.extend({ user: authUserResponseSchema, tokens: z.object({ accessToken: z.string().min(1), expiresIn: z.number().finite().positive().optional() }).passthrough() }),
}).passthrough();

export const refreshEnvelopeResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({
    tokens: z.object({ accessToken: z.string().min(1), expiresIn: z.number().finite().positive().optional() }).passthrough(),
    csrfToken: z.string().optional(),
  }).passthrough(),
}).passthrough();

const criticalAdDataSchema = z.object({ id: z.string().min(1), title: z.string().min(1) }).passthrough();
export const criticalAdEnvelopeResponseSchema = z.object({
  success: z.literal(true),
  data: criticalAdDataSchema,
  message: z.string().optional(),
}).passthrough();

const criticalOrderDataSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  items: z.array(z.object({ id: z.string().min(1), quantity: z.number().finite().positive() }).passthrough()),
}).passthrough();
export const criticalOrderEnvelopeResponseSchema = z.object({
  success: z.literal(true),
  data: criticalOrderDataSchema,
  message: z.string().optional(),
}).passthrough();

export const criticalOrderListEnvelopeResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(criticalOrderDataSchema),
  message: z.string().optional(),
  meta: z.unknown().optional(),
}).passthrough();

const optionalNullableString = z.string().nullable().optional();
const paginationResponseSchema = z.object({
  page: z.number().finite().int().positive().optional(),
  limit: z.number().finite().int().positive().optional(),
  total: z.number().finite().nonnegative().optional(),
  totalPages: z.number().finite().int().nonnegative().optional(),
  nextCursor: z.string().nullable().optional(),
}).passthrough();
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
  return z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data,
    meta: mobileApiMetaSchema.optional(),
  }).passthrough();
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
