'use client';

/**
 * lib/fetchTimeout.ts
 *
 * NETWORK-FETCH-TIMEOUT-01: shared wrapper around window.fetch that
 * enforces a hard deadline. Warming, auto-read, saved-ads prefetch and
 * the store-catalog downloader all used raw fetch() — on Gaza mobile
 * networks a stalled connection keeps the promise pending until the
 * browser's own ~300s default timeout, so a single slow URL could hang
 * an entire warming pass, leave the download spinner up for minutes,
 * or pin a cold-start 'connecting' state indefinitely.
 *
 * 15s is a compromise: enough for a genuine cold TLS handshake + first
 * byte from Render's free tier; short enough that an unreachable host
 * is abandoned before the user wonders why nothing happened.
 *
 * Respects a caller-supplied signal: if `init.signal` is present, the
 * caller owns the cancellation policy and we don't add a second
 * controller on top (that would double-abort in confusing ways).
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (init.signal) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}
