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

/** CHAT-LINK: mirrors ConversationAdSummary's nullable-context shape,
 * for a conversation started from a ServiceRequest instead of an ad. */
export interface ConversationServiceRequestSummary {
  id: string;
  details: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  listing: { id: string; title: string; images: string[] };
}

export interface Conversation {
  id: string;
  adId: string | null;
  serviceRequestId: string | null;
  buyerId: string;
  sellerId: string;
  pinnedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ad: ConversationAdSummary | null;
  serviceRequest: ConversationServiceRequestSummary | null;
  buyer: ConversationParticipant;
  seller: ConversationParticipant;
}

/**
 * FIX UX-15: GET /conversations (the list) returns this shape — plain
 * Conversation plus a per-thread unreadCount, mirroring the backend's
 * ConversationListItem. Kept separate from Conversation itself since
 * GET /conversations/:id (a single thread) has no unreadCount — that
 * page marks messages read as a side effect of GET .../messages
 * instead, so a badge on the thread you're currently viewing wouldn't
 * mean anything.
 */
export interface ConversationListItem extends Conversation {
  unreadCount: number;
  /** Newest message in the thread (body already redacted if soft-deleted). */
  lastMessage: Message | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  /** Optional image attachment URL (Cloudinary). */
  imageUrl: string | null;
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
// Exactly one of adId or userId — mirrors the backend's refine() guard.
// adId: SellerCard's "مراسلة البائع" (ad-scoped). userId: PublicProfileHeader's
// "مراسلة" (direct, no ad in context).
export type StartConversationPayload =
  | { adId: string; userId?: never; serviceRequestId?: never }
  | { userId: string; adId?: never; serviceRequestId?: never }
  | { serviceRequestId: string; adId?: never; userId?: never };

/** POST /conversations/:id/messages. */
export interface SendMessagePayload {
  body?: string;
  imageUrl?: string;
}

export interface ConversationsQuery {
  page?: number;
  limit?: number;
  includeArchived?: boolean;
  archivedOnly?: boolean;
}

export interface MessagesQuery {
  page?: number;
  limit?: number;
}
