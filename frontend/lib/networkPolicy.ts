/**
 * Central network policy for bandwidth-sensitive client work.
 *
 * This is deliberately policy-only: it does not start requests or mutate
 * application state. Consumers can use one decision source instead of
 * duplicating navigator.connection/effectiveType checks.
 */
'use client';

import {
  getAverageRequestMs,
  getConsecutiveFailures,
  getConnectionQuality,
  type ConnectionQuality,
} from './connectionQuality';

export type NetworkTier = 'offline' | 'very-slow' | 'slow' | 'normal' | 'fast' | 'unknown';

export interface NetworkPolicy {
  tier: NetworkTier;
  quality: ConnectionQuality;
  saveData: boolean;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  consecutiveFailures: number;
  allowPrefetch: boolean;
  allowBackgroundWarming: boolean;
  allowBackgroundSync: boolean;
  allowOriginalImages: boolean;
  pageSizeMultiplier: number;
  maxPrefetchDistancePx: number;
  maxPrefetchConcurrency: number;
  queueConcurrency: number;
  uploadConcurrency: number;
  uploadTimeoutMs: number;
  uploadRetryDelaysMs: number[];
  requestTimeoutMs: number;
}

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

function readConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  return (
    (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null
  );
}

function getTier(
  quality: ConnectionQuality,
  conn: NetworkInformationLike | null,
  avgMs: number | null,
): NetworkTier {
  if (quality === 'offline') return 'offline';

  const effectiveType = conn?.effectiveType?.toLowerCase();
  const downlink = conn?.downlink;

  if (
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    (typeof downlink === 'number' && downlink > 0 && downlink < 0.4) ||
    (avgMs != null && avgMs >= 4000)
  ) {
    return 'very-slow';
  }

  if (
    effectiveType === '3g' ||
    (typeof downlink === 'number' && downlink > 0 && downlink < 1.5) ||
    (avgMs != null && avgMs >= 1800) ||
    quality === 'slow'
  ) {
    return 'slow';
  }

  if (avgMs != null && avgMs < 1000) {
    return 'fast';
  }

  if (effectiveType === '4g') {
    return typeof downlink === 'number' && downlink >= 10 ? 'fast' : 'normal';
  }

  if (quality === 'fast') return 'fast';
  return 'unknown';
}

export function getNetworkPolicy(): NetworkPolicy {
  const conn = readConnection();
  const quality = getConnectionQuality();
  const avgMs = getAverageRequestMs();
  const failures = getConsecutiveFailures();
  const saveData = conn?.saveData === true;
  const tier = getTier(quality, conn, avgMs);

  if (tier === 'offline') {
    return {
      tier,
      quality,
      saveData,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? avgMs,
      consecutiveFailures: failures,
      allowPrefetch: false,
      allowBackgroundWarming: false,
      allowBackgroundSync: false,
      allowOriginalImages: false,
      pageSizeMultiplier: 0,
      maxPrefetchDistancePx: 0,
      maxPrefetchConcurrency: 0,
      queueConcurrency: 0,
      uploadConcurrency: 0,
      uploadTimeoutMs: 0,
      uploadRetryDelaysMs: [],
      requestTimeoutMs: 0,
    };
  }

  if (tier === 'very-slow') {
    return {
      tier,
      quality,
      saveData,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? avgMs,
      consecutiveFailures: failures,
      allowPrefetch: false,
      allowBackgroundWarming: failures < 3 && !saveData,
      allowBackgroundSync: true,
      allowOriginalImages: false,
      pageSizeMultiplier: 0.4,
      maxPrefetchDistancePx: 100,
      maxPrefetchConcurrency: 0,
      queueConcurrency: 1,
      uploadConcurrency: 1,
      uploadTimeoutMs: 45_000,
      uploadRetryDelaysMs: [2500],
      requestTimeoutMs: 25_000,
    };
  }

  if (tier === 'slow') {
    return {
      tier,
      quality,
      saveData,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? avgMs,
      consecutiveFailures: failures,
      allowPrefetch: false,
      allowBackgroundWarming: failures < 3,
      allowBackgroundSync: true,
      allowOriginalImages: false,
      pageSizeMultiplier: 0.65,
      maxPrefetchDistancePx: 300,
      maxPrefetchConcurrency: 0,
      queueConcurrency: 1,
      uploadConcurrency: 1,
      uploadTimeoutMs: 40_000,
      uploadRetryDelaysMs: [2000],
      requestTimeoutMs: 20_000,
    };
  }

  if (tier === 'fast') {
    return {
      tier,
      quality,
      saveData,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
      rttMs: conn?.rtt ?? avgMs,
      consecutiveFailures: failures,
      allowPrefetch: !saveData,
      allowBackgroundWarming: failures < 3 && !saveData,
      allowBackgroundSync: true,
      allowOriginalImages: !saveData,
      pageSizeMultiplier: 1,
      maxPrefetchDistancePx: 900,
      maxPrefetchConcurrency: saveData ? 0 : 3,
      queueConcurrency: 3,
      uploadConcurrency: 2,
      uploadTimeoutMs: 30_000,
      uploadRetryDelaysMs: [1200, 3000],
      requestTimeoutMs: 12_000,
    };
  }

  return {
    tier: 'unknown',
    quality,
    saveData,
    effectiveType: conn?.effectiveType ?? null,
    downlinkMbps: conn?.downlink ?? null,
    rttMs: conn?.rtt ?? avgMs,
    consecutiveFailures: failures,
    allowPrefetch: !saveData,
    allowBackgroundWarming: failures < 3 && !saveData,
    allowBackgroundSync: true,
    allowOriginalImages: false,
    pageSizeMultiplier: 0.8,
    maxPrefetchDistancePx: 500,
    maxPrefetchConcurrency: saveData ? 0 : 1,
    queueConcurrency: 1,
    uploadConcurrency: 1,
    uploadTimeoutMs: 35_000,
    uploadRetryDelaysMs: [2000],
    requestTimeoutMs: 18_000,
  };
}

export function getAdaptivePageSize(
  baseSize: number,
  policy: NetworkPolicy = getNetworkPolicy(),
  minSize = 4,
  maxSize = 24,
): number {
  if (!Number.isFinite(baseSize) || baseSize <= 0) return minSize;
  if (policy.tier === 'offline') return minSize;

  const scaled = Math.round(baseSize * policy.pageSizeMultiplier);
  return Math.min(maxSize, Math.max(minSize, scaled));
}

export function subscribeNetworkPolicy(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const events = ['online', 'offline'];
  for (const event of events) window.addEventListener(event, listener);

  const conn = readConnection() as (NetworkInformationLike & EventTarget) | null;
  if (conn && typeof conn.addEventListener === 'function') {
    conn.addEventListener('change', listener);
  }

  return () => {
    for (const event of events) window.removeEventListener(event, listener);
    if (conn && typeof conn.removeEventListener === 'function') {
      conn.removeEventListener('change', listener);
    }
  };
}
