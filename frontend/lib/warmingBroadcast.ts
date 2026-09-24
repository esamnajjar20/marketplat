/**
 * lib/warmingBroadcast.ts
 *
 * PHASE-4e — mirror warming progress across tabs.
 *
 * Without this, only the tab that holds the Web Lock shows warming
 * progress in its indicator; the other tabs are silent, which looks
 * broken to a user who opened the app in three tabs and sees a
 * progress bar in only one.
 *
 * Broadcasting is one-way: the tab that actually runs warming emits
 * updates; every other tab applies them to its local state and does
 * NOT re-emit. This avoids an infinite echo loop.
 *
 * BroadcastChannel is supported in all modern browsers; Safari ≥ 15.4.
 * If unavailable, we degrade silently: each tab simply sees its own
 * progress, same as before this file existed.
 */
'use client';

import type { WarmingSource, SourceProgress } from './warmingProgress';

const CHANNEL_NAME = 'marketplat-warming-progress';

type Payload = {
  source: WarmingSource;
  update: Partial<SourceProgress>;
  /** origin timestamp, used to ignore out-of-order deliveries */
  at: number;
};

let channel: BroadcastChannel | null = null;
let initialized = false;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel === 'undefined') return null;
  if (initialized) return channel;
  initialized = true;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    channel = null;
  }
  return channel;
}

export function broadcastProgress(
  source: WarmingSource,
  update: Partial<SourceProgress>,
): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    const payload: Payload = { source, update, at: Date.now() };
    ch.postMessage(payload);
  } catch {
    // silent — progress broadcasting is best-effort
  }
}

export function subscribeRemoteProgress(
  handler: (source: WarmingSource, update: Partial<SourceProgress>) => void,
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (ev: MessageEvent) => {
    const data = ev.data as Payload | undefined;
    if (!data || typeof data !== 'object') return;
    if (typeof data.source !== 'string') return;
    if (!data.update || typeof data.update !== 'object') return;
    handler(data.source, data.update);
  };
  ch.addEventListener('message', listener);
  return () => {
    ch.removeEventListener('message', listener);
  };
}
