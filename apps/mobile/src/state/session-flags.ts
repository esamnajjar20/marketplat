/**
 * Lightweight process-wide flags (no third-party store yet).
 * Prefer this over scattering module-level booleans for UI that is not
 * part of React context (e.g. offline-queue badge hints).
 *
 * Phase 2 deliberately avoids adding Zustand until lockfile + review.
 * Swap this for a real store later without changing call sites much.
 */

type Listener = () => void;

let outboxBadgeCount = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function getOutboxBadgeCount(): number {
  return outboxBadgeCount;
}

export function setOutboxBadgeCount(n: number): void {
  const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (next === outboxBadgeCount) return;
  outboxBadgeCount = next;
  emit();
}

export function subscribeOutboxBadge(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
