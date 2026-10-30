import type { OutboxItem } from './mutation-outbox';
export type OutboxHeadDecision =
  | { status: 'nothing-due' }
  | { status: 'already-processing'; id: string }
  | { status: 'blocked-by-exhausted'; id: string; operation: string; attempts: number }
  | { status: 'waiting-for-retry'; id: string; nextAttemptAt: number }
  | { status: 'blocked-by-unsupported'; id: string; operation: string }
  | { status: 'send-create-ad'; id: string }
  | { status: 'send-delete-ad'; id: string }
  | { status: 'send-update-ad'; id: string };
export function decideOutboxHeadAction(candidate: OutboxItem | null, now: number): OutboxHeadDecision;
