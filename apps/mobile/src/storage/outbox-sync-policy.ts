/** Typed application façade for the pure policy kept in outbox-sync-policy.mjs. */
import { decideOutboxHeadAction as decide } from './outbox-sync-policy.mjs';
import type { OutboxItem } from '@/storage/mutation-outbox';
import type { OutboxHeadDecision } from './outbox-sync-policy.mjs';

export type { OutboxHeadDecision } from './outbox-sync-policy.mjs';

export function decideOutboxHeadAction(
  candidate: OutboxItem | null,
  now: number,
): OutboxHeadDecision {
  return decide(candidate, now);
}
