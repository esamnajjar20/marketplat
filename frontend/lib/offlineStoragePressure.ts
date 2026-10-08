/**
 * Storage-pressure guard for background offline warming.
 *
 * Cache Storage and IndexedDB share the browser's origin quota. Warming can
 * therefore fail even when its own cache limits look healthy. This module
 * keeps warming away from the high-water mark and only evicts disposable
 * cache buckets; drafts, queued mutations, messages, saved ads and user data
 * are never touched by the automatic cleanup.
 */
'use client';

export const STORAGE_WARNING_RATIO = 0.8;
export const STORAGE_CRITICAL_RATIO = 0.9;

export type StoragePressure = 'unknown' | 'normal' | 'warning' | 'critical';

export interface StorageEstimate {
  usageBytes: number | null;
  quotaBytes: number | null;
  ratio: number | null;
  pressure: StoragePressure;
}

function classify(ratio: number | null): StoragePressure {
  if (ratio == null || !Number.isFinite(ratio)) return 'unknown';
  if (ratio >= STORAGE_CRITICAL_RATIO) return 'critical';
  if (ratio >= STORAGE_WARNING_RATIO) return 'warning';
  return 'normal';
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null, ratio: null, pressure: 'unknown' };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
    const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    const ratio =
      usageBytes != null && quotaBytes != null && quotaBytes > 0
        ? Math.min(1, Math.max(0, usageBytes / quotaBytes))
        : null;
    return { usageBytes, quotaBytes, ratio, pressure: classify(ratio) };
  } catch {
    return { usageBytes: null, quotaBytes: null, ratio: null, pressure: 'unknown' };
  }
}

/**
 * Evict only data that can be reconstructed from the network.
 * Never delete drafts, the offline queue, saved ads, user-data cache, or
 * personal shells automatically.
 */
export async function cleanupDisposableOfflineCaches(): Promise<string[]> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return [];
  try {
    const registration = await navigator.serviceWorker.ready;
    const target = registration.active ?? navigator.serviceWorker.controller;
    if (!target) return [];
    target.postMessage({ type: 'TRIM_DISPOSABLE_CACHES' });
    return ['service-worker-trim-requested'];
  } catch {
    return [];
  }
}

/**
 * Returns true when automatic warming should stop. At the critical threshold
 * we first remove disposable caches, then re-check the browser quota. If the
 * origin is still critically full, warming must yield to user data and drafts.
 */
export type BackgroundWarmingBudget = 'full' | 'public-only' | 'paused';

export async function getBackgroundWarmingBudget(): Promise<BackgroundWarmingBudget> {
  const estimate = await getStorageEstimate();
  if (estimate.pressure === 'critical') return 'paused';
  if (estimate.pressure === 'warning') return 'public-only';
  return 'full';
}

export async function shouldPauseBackgroundWarming(): Promise<boolean> {
  const before = await getStorageEstimate();
  if (before.pressure !== 'critical') return false;

  await cleanupDisposableOfflineCaches();
  const after = await getStorageEstimate();
  return after.pressure === 'critical';
}
