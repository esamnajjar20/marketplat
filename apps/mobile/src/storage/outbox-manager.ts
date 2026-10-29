/**
 * Unified façade over durable outbox queues.
 *
 * Prefer this module from UI / logout flows when you only need:
 * - pending counts / snapshot
 * - high-level status for the offline-queue screen
 *
 * Sync workers should keep using the specific modules (mutation-outbox,
 * order-outbox, chat-*-outbox, entity-create-outbox) for enqueue/claim/ack.
 *
 * Dual .ts / .mjs copies under this folder exist for Node static tests that
 * cannot load TypeScript; treat the `.ts` file as the source of truth.
 */
import {
  clearMutationOutbox,
  countUnownedOutboxMutations,
  listPendingMutations,
  type OutboxItem,
} from '@/storage/mutation-outbox';
import {
  listOfflineCreates,
  type OfflineCreateItem,
} from '@/storage/entity-create-outbox';
import {
  listPendingMarketplaceOrders,
  type PendingOrderOutboxItem,
} from '@/storage/order-outbox';
import {
  countPendingChatMessages,
  listChatMessagesForOwner,
  type ChatMessageOutboxItem,
} from '@/storage/chat-message-outbox';
import {
  listChatMediaOutbox,
  type ChatMediaOutboxItem,
} from '@/storage/chat-media-outbox';

export type OutboxSnapshot = {
  mutations: OutboxItem[];
  offlineCreates: OfflineCreateItem[];
  orders: PendingOrderOutboxItem[];
  chatMessages: ChatMessageOutboxItem[];
  chatMedia: ChatMediaOutboxItem[];
  /** Sum of listed pending rows (best-effort). */
  totalPending: number;
};

async function safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

/** Aggregate pending work for the current account. */
export async function getOutboxSnapshot(ownerId?: string | null): Promise<OutboxSnapshot> {
  const id = ownerId?.trim() || '';
  const [mutations, offlineCreates, orders, chatMessages, chatMedia] = await Promise.all([
    safeList(() => listPendingMutations(ownerId)),
    safeList(() => listOfflineCreates(ownerId)),
    safeList(() => listPendingMarketplaceOrders(ownerId)),
    id ? safeList(() => listChatMessagesForOwner(id)) : Promise.resolve([] as ChatMessageOutboxItem[]),
    id ? safeList(() => listChatMediaOutbox(id)) : Promise.resolve([] as ChatMediaOutboxItem[]),
  ]);

  return {
    mutations,
    offlineCreates,
    orders,
    chatMessages,
    chatMedia,
    totalPending:
      mutations.length + offlineCreates.length + orders.length + chatMessages.length + chatMedia.length,
  };
}

/** Quick pending total for logout warnings (mutations + creates + orders + chat). */
export async function countPendingOutboxItems(ownerId?: string | null): Promise<number> {
  const snap = await getOutboxSnapshot(ownerId);
  return snap.totalPending;
}

export async function countOrphanMutations(): Promise<number> {
  try {
    return await countUnownedOutboxMutations();
  } catch {
    return 0;
  }
}

/**
 * Clears the shared mutation outbox table.
 * Chat/order rows are owner-scoped; full private wipe remains in public-cache cleanup.
 */
export async function clearMutationQueue(): Promise<void> {
  await clearMutationOutbox();
}

export async function countPendingChat(ownerId?: string | null): Promise<number> {
  try {
    return await countPendingChatMessages(ownerId);
  } catch {
    return 0;
  }
}

export type { OutboxItem, OfflineCreateItem, PendingOrderOutboxItem, ChatMessageOutboxItem, ChatMediaOutboxItem };
