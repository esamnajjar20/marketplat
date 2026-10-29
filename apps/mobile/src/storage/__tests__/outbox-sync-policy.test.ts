import { describe, expect, it } from 'vitest';
import { decideOutboxHeadAction } from '../outbox-sync-policy';
import type { OutboxItem } from '../mutation-outbox';

function item(partial: Partial<OutboxItem>): OutboxItem {
  return {
    id: '1',
    ownerId: 'u',
    operation: 'create-ad',
    resourceId: null,
    payloadJson: '{}',
    idempotencyKey: 'k',
    state: 'pending',
    attempts: 0,
    createdAt: 1,
    lastError: null,
    nextAttemptAt: 0,
    leaseOwner: null,
    leaseUntil: 0,
    ...partial,
  };
}

describe('decideOutboxHeadAction', () => {
  it('returns nothing-due for empty queue', () => {
    expect(decideOutboxHeadAction(null, Date.now()).status).toBe('nothing-due');
  });

  it('blocks exhausted attempts', () => {
    const d = decideOutboxHeadAction(item({ attempts: 8, state: 'failed' }), Date.now());
    expect(d.status).toBe('blocked-by-exhausted');
  });

  it('schedules create when due', () => {
    const d = decideOutboxHeadAction(item({ operation: 'create-ad' }), Date.now());
    expect(d.status).toBe('send-create-ad');
  });
});
