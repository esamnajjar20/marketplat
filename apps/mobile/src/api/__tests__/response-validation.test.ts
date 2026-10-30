import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseApiResponse } from '@/api/response-validation';
import {
  authEnvelopeResponseSchema,
  refreshEnvelopeResponseSchema,
  criticalAdEnvelopeResponseSchema,
  criticalOrderEnvelopeResponseSchema,
  criticalOrderListEnvelopeResponseSchema,
  chatMessageEnvelopeResponseSchema,
  chatMessageListEnvelopeResponseSchema,
  conversationListEnvelopeResponseSchema,
  notificationListEnvelopeResponseSchema,
  unreadCountEnvelopeResponseSchema,
} from '@/api/response-schemas';

describe('parseApiResponse', () => {
  const schema = z.object({ success: z.literal(true), data: z.object({ id: z.string().min(1) }) });

  it('returns parsed data for a valid API response', () => {
    expect(parseApiResponse(schema, { success: true, data: { id: 'order-1' } })).toEqual({
      success: true, data: { success: true, data: { id: 'order-1' } },
    });
  });

  it('rejects a successful HTTP payload that violates the endpoint contract', () => {
    expect(parseApiResponse(schema, { success: true, data: { id: 42 } })).toEqual({ success: false });
    expect(parseApiResponse(schema, null)).toEqual({ success: false });
  });
});


describe('critical mobile API contracts', () => {
  it('accepts a valid login response without exposing a refresh token field', () => {
    const payload = {
      success: true,
      data: {
        user: { id: 'user-1', name: 'Tester', email: 'tester@example.com', role: 'USER' },
        tokens: { accessToken: 'access-token', expiresIn: 900 },
        csrfToken: 'csrf-token',
      },
    };
    expect(parseApiResponse(authEnvelopeResponseSchema, payload).success).toBe(true);
  });

  it('rejects auth and refresh responses without required access tokens', () => {
    expect(parseApiResponse(authEnvelopeResponseSchema, {
      success: true,
      data: { user: { id: 'user-1', name: 'Tester', email: 'tester@example.com', role: 'USER' }, tokens: {} },
    })).toEqual({ success: false });
    expect(parseApiResponse(refreshEnvelopeResponseSchema, { success: true, data: { tokens: {} } }))
      .toEqual({ success: false });
  });

  it('rejects malformed ad mutations before the UI receives the payload', () => {
    expect(parseApiResponse(criticalAdEnvelopeResponseSchema, { success: true, data: { id: 'ad-1' } }))
      .toEqual({ success: false });
    expect(parseApiResponse(criticalAdEnvelopeResponseSchema, { success: true, data: { id: 'ad-1', title: 'Bicycle' } }).success)
      .toBe(true);
  });

  it('validates the order status and item identity/quantity contract', () => {
    const validOrder = {
      id: 'order-1', status: 'PENDING',
      items: [{ id: 'item-1', quantity: 2, productId: 'product-1' }],
    };
    expect(parseApiResponse(criticalOrderEnvelopeResponseSchema, { success: true, data: validOrder }).success).toBe(true);
    expect(parseApiResponse(criticalOrderEnvelopeResponseSchema, {
      success: true, data: { ...validOrder, status: 'INVALID' },
    })).toEqual({ success: false });
    expect(parseApiResponse(criticalOrderEnvelopeResponseSchema, {
      success: true, data: { ...validOrder, items: [{ id: 'item-1', quantity: 0 }] },
    })).toEqual({ success: false });
  });

  it('validates order lists as arrays rather than accepting object envelopes', () => {
    expect(parseApiResponse(criticalOrderListEnvelopeResponseSchema, {
      success: true, data: [{ id: 'order-1', status: 'PENDING', items: [] }], meta: { pagination: { page: 1 } },
    }).success).toBe(true);
    expect(parseApiResponse(criticalOrderListEnvelopeResponseSchema, {
      success: true, data: { items: [] },
    })).toEqual({ success: false });
  });
});


describe('messaging and notification contracts', () => {
  const message = { id: 'message-1', senderId: 'user-1', body: 'Hello', createdAt: '2026-10-30T10:00:00.000Z' };
  const conversation = {
    id: 'conversation-1', buyerId: 'user-1', sellerId: 'user-2',
    buyer: { id: 'user-1', name: 'Buyer' }, seller: { id: 'user-2', name: 'Seller' },
    lastMessage: message, unreadCount: 1,
  };

  it('accepts well-formed message and conversation pages while rejecting malformed IDs', () => {
    expect(parseApiResponse(chatMessageEnvelopeResponseSchema, { success: true, data: message }).success).toBe(true);
    expect(parseApiResponse(chatMessageEnvelopeResponseSchema, { success: true, data: { ...message, senderId: '' } })).toEqual({ success: false });
    expect(parseApiResponse(chatMessageListEnvelopeResponseSchema, { success: true, data: [message] }).success).toBe(true);
    expect(parseApiResponse(conversationListEnvelopeResponseSchema, { success: true, data: [conversation] }).success).toBe(true);
    expect(parseApiResponse(conversationListEnvelopeResponseSchema, { success: true, data: [{ ...conversation, buyer: { name: 'Missing ID' } }] })).toEqual({ success: false });
  });

  it('validates notifications and normalizes safe numeric unread-count strings', () => {
    expect(parseApiResponse(notificationListEnvelopeResponseSchema, { success: true, data: [{ id: 'notification-1', type: 'message', title: 'New message', body: 'Hello', createdAt: '2026-10-30T10:00:00.000Z' }] }).success).toBe(true);
    expect(parseApiResponse(unreadCountEnvelopeResponseSchema, { success: true, data: { count: '12' } })).toEqual({ success: true, data: { success: true, data: { count: 12 } } });
    expect(parseApiResponse(unreadCountEnvelopeResponseSchema, { success: true, data: { count: '-1' } })).toEqual({ success: false });
  });
});
