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
import { listPendingMarketplaceRequests, type PendingRequestOutboxItem } from '@/storage/request-outbox';
import { listPendingRequestOffers, type PendingRequestOfferItem } from '@/storage/request-offer-outbox';

// Public queue façade for screens and UI workflows. Workers may still use the
// specific queue modules internally, but screens should not couple directly to
// the SQLite queue implementations.
export * from '@/storage/mutation-outbox';
export * from '@/storage/entity-create-outbox';
export * from '@/storage/order-outbox';
export * from '@/storage/chat-message-outbox';
export * from '@/storage/chat-media-outbox';
export * from '@/storage/request-outbox';
export * from '@/storage/request-offer-outbox';
export { syncOutboxIfReady } from '@/storage/outbox-sync';

export type OutboxSnapshot = {
  mutations: OutboxItem[];
  offlineCreates: OfflineCreateItem[];
  orders: PendingOrderOutboxItem[];
  chatMessages: ChatMessageOutboxItem[];
  chatMedia: ChatMediaOutboxItem[];
  requests: PendingRequestOutboxItem[];
  requestOffers: PendingRequestOfferItem[];
  /** Sum of visible pending rows. If isComplete is false, this is only a lower bound. */
  totalPending: number;
  /** Queue names whose read failed; callers must not treat an incomplete snapshot as empty. */
  failedQueues: string[];
  isComplete: boolean;
};

type QueueRead<T> = { value: T[]; failed: boolean };

async function readQueue<T>(fn: () => Promise<T[]>): Promise<QueueRead<T>> {
  try { return { value: await fn(), failed: false }; }
  catch { return { value: [], failed: true }; }
}

/** Aggregate pending work for the current account without hiding read failures. */
export async function getOutboxSnapshot(ownerId?: string | null): Promise<OutboxSnapshot> {
  const id = ownerId?.trim() || '';
  const queueNames = ['mutations', 'offlineCreates', 'orders', 'chatMessages', 'chatMedia', 'requests', 'requestOffers'];
  const [mutationRead, createRead, orderRead, chatRead, mediaRead, requestRead, offerRead] = await Promise.all([
    readQueue(() => listPendingMutations(ownerId)),
    readQueue(() => listOfflineCreates(ownerId)),
    readQueue(() => listPendingMarketplaceOrders(ownerId)),
    id ? readQueue(() => listChatMessagesForOwner(id)) : Promise.resolve({ value: [] as ChatMessageOutboxItem[], failed: true }),
    id ? readQueue(() => listChatMediaOutbox(id)) : Promise.resolve({ value: [] as ChatMediaOutboxItem[], failed: true }),
    id ? readQueue(() => listPendingMarketplaceRequests(id)) : Promise.resolve({ value: [] as PendingRequestOutboxItem[], failed: true }),
    id ? readQueue(() => listPendingRequestOffers(id)) : Promise.resolve({ value: [] as PendingRequestOfferItem[], failed: true }),
  ]);
  const reads = [mutationRead, createRead, orderRead, chatRead, mediaRead, requestRead, offerRead];
  const failedQueues = queueNames.filter((_, index) => reads[index].failed);
  const mutations = mutationRead.value;
  const offlineCreates = createRead.value;
  const orders = orderRead.value;
  const chatMessages = chatRead.value;
  const chatMedia = mediaRead.value;
  const requests = requestRead.value;
  const requestOffers = offerRead.value;
  return {
    mutations, offlineCreates, orders, chatMessages, chatMedia, requests, requestOffers, failedQueues,
    isComplete: failedQueues.length === 0,
    totalPending: mutations.length + offlineCreates.length + orders.length + chatMessages.length + chatMedia.length + requests.length + requestOffers.length,
  };
}

/** A count is only trustworthy when every configured queue was read successfully. */
export async function countPendingOutboxItems(ownerId?: string | null): Promise<number> {
  const snapshot = await getOutboxSnapshot(ownerId);
  if (!snapshot.isComplete) {
    throw new Error(`تعذر فحص طوابير المزامنة: ${snapshot.failedQueues.join(', ')}`);
  }
  return snapshot.totalPending;
}

export async function countOrphanMutations(): Promise<number> {
  return countUnownedOutboxMutations();
}

export async function countPendingChat(ownerId?: string | null): Promise<number> {
  return countPendingChatMessages(ownerId);
}

/**
 * Clears the shared mutation outbox table.
 * Chat/order rows are owner-scoped; full private wipe remains in public-cache cleanup.
 */
export async function clearMutationQueue(): Promise<void> {
  await clearMutationOutbox();
}


export type { OutboxItem, OfflineCreateItem, PendingOrderOutboxItem, ChatMessageOutboxItem, ChatMediaOutboxItem };
