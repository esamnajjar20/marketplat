/**
 * PERF-AUTH-CLEANUP-SPLIT — the heavy IndexedDB / Cache-backed stores that must
 * be wiped when a session ends. They used to be imported statically by
 * lib/authCleanup.ts, which AppProviders → AuthHydrationProvider and
 * api/client.ts pull into EVERY route's first-load JS, although they are only
 * needed at logout / account switch.
 *
 * authCleanup.ts now loads this module on demand (and warms it during idle
 * time, see preloadAuthCleanupStores). If loading ever fails (e.g. the user
 * logs out offline and the chunk was never cached) authCleanup records a
 * durable "pending cleanup" flag and retries on the next app start — the wipe is
 * delayed, never silently skipped.
 *
 * The bodies below are moved verbatim from clearSensitiveLocalData(); keep the
 * relative order (queue is stopped BEFORE sales drafts are removed).
 */
import { clearDraftOnlyAdDrafts } from '@/lib/offlineAdDrafts';
import { clearOfflineQueue } from '@/lib/offlineQueue';
import { clearCatalogDownloads } from '@/lib/downloadStorage';
import { clearAllSalesDrafts } from '@/lib/sales-offline/salesDraftStore';
import { clearOfflineMessagesStore } from '@/lib/offlineMessagesStore';
import { clearConversationMediaStore } from '@/lib/conversationMediaStore';
import { clearAutoReadCache } from '@/lib/offlineAutoRead';
import { clearPersonalWarmingState } from '@/lib/offlineWarmingState';

/** Stage 1 — auto-read index + its Cache Storage bucket (visited ads, no user scoping). */
export async function clearAutoReadStage(): Promise<void> {
  await clearAutoReadCache();
}

/** Stage 2 — drafts, mutation queue, sales drafts, catalogs, messages, media, warming state. */
export async function clearOfflineStoresStage(): Promise<void> {
  try {
    await clearDraftOnlyAdDrafts();
  } catch (err) {
    console.warn('[auth-cleanup] draft cleanup failed:', err);
  }
  // Await the queue wipe so no User-A items survive the post-logout navigation.
  try {
    await clearOfflineQueue();
  } catch (err) {
    console.warn('[auth-cleanup] clearOfflineQueue failed:', err);
  }
  // Sales drafts contain buyer/contact/cost/internal-note data. Clear them only
  // after the shared mutation queue is stopped so logout cannot race a replay.
  try {
    await clearAllSalesDrafts();
  } catch (err) {
    console.warn('[auth-cleanup] sales draft cleanup failed:', err);
  }
  // Store-catalog download log + bodies live in IndexedDB.
  await clearCatalogDownloads();
  await clearOfflineMessagesStore();
  try {
    await clearConversationMediaStore();
  } catch (err) {
    console.warn('[auth-cleanup] conversation media wipe failed:', err);
  }
  // Without this the warming snapshot would claim every personal route is
  // complete on the next login and the personal shell cache would stay empty.
  void clearPersonalWarmingState();
}
