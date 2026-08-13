/**
 * Conversation / Message types — Epic 5 (messaging). Mirrors backend's
 * actual Prisma models and conversations.repository.ts's includes,
 * verified directly against the real backend module (not against the
 * pre-Epic-5 "لا يوجد Prisma Models" note in messages/page.tsx's own
 * FIX AUDIT-V4-03 comment, which is now stale).
 */

export interface ConversationParticipant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** The linked ad's summary — null once the ad is deleted (onDelete:
 * SetNull on Conversation.adId) or for a conversation that was never
 * ad-linked to begin with. */
export interface ConversationAdSummary {
  id: string;
  title: string;
  images: string[];
  status: 'ACTIVE' | 'SOLD' | 'DELETED';
}

export interface Conversation {
  id: string;
  adId: string | null;
  buyerId: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
  ad: ConversationAdSummary | null;
  buyer: ConversationParticipant;
  seller: ConversationParticipant;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  // Soft-delete marker — mirrors backend's Message.deletedAt. When set,
  // `body` has already been redacted to '' by the backend (see
  // conversations.service.ts's redactIfDeleted) — the frontend never
  // needs to blank it itself, only decide how to render the placeholder.
  deletedAt: string | null;
  createdAt: string;
}

// ── Payloads ─────────────────────────────────────────────────────

/** POST /conversations — always ad-scoped from the current UI's only
 * entry point (SellerCard's "مراسلة البائع"). Reopens the existing
 * thread for that (ad, caller, seller) triple if one already exists. */
export interface StartConversationPayload {
  adId: string;
}

/** POST /conversations/:id/messages. */
export interface SendMessagePayload {
  body: string;
}

export interface ConversationsQuery {
  page?: number;
  limit?: number;
}

export interface MessagesQuery {
  page?: number;
  limit?: number;
}
