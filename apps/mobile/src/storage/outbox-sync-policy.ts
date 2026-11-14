/** Minimal shape of an outbox row needed by the policy (structurally satisfied by `OutboxItem`). */
export interface OutboxHeadCandidate {
  id: string;
  state: string;
  attempts: number;
  nextAttemptAt: number;
  operation: string;
}

export type OutboxHeadDecision =
  | { status: 'nothing-due' }
  | { status: 'already-processing'; id: string }
  | { status: 'blocked-by-exhausted'; id: string; operation: string; attempts: number }
  | { status: 'waiting-for-retry'; id: string; nextAttemptAt: number }
  | { status: 'blocked-by-unsupported'; id: string; operation: string }
  | { status: 'send-create-ad'; id: string }
  | { status: 'send-delete-ad'; id: string }
  | { status: 'send-update-ad'; id: string };

/** Pure decision policy for the strict-FIFO outbox head. No database or network effects. */
export function decideOutboxHeadAction(
  candidate: OutboxHeadCandidate | null,
  now: number,
): OutboxHeadDecision {
  if (!candidate) return { status: 'nothing-due' };
  if (candidate.state === 'processing') return { status: 'already-processing', id: candidate.id };
  if (candidate.attempts >= 8) {
    return { status: 'blocked-by-exhausted', id: candidate.id, operation: candidate.operation, attempts: candidate.attempts };
  }
  if (candidate.nextAttemptAt > now) {
    return { status: 'waiting-for-retry', id: candidate.id, nextAttemptAt: candidate.nextAttemptAt };
  }
  if (candidate.operation === 'create-ad') return { status: 'send-create-ad', id: candidate.id };
  if (candidate.operation === 'delete-ad') return { status: 'send-delete-ad', id: candidate.id };
  if (candidate.operation === 'update-ad') return { status: 'send-update-ad', id: candidate.id };
  return { status: 'blocked-by-unsupported', id: candidate.id, operation: candidate.operation };
}
