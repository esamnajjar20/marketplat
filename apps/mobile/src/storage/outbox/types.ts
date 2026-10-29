/**
 * أنواع مشتركة لطوابير الـ Outbox ذات آلة الحالة (pending → processing → failed).
 * الطوابير البسيطة (مثل chat message بدون lease) تستخدم جزءًا من هذه الحقول فقط.
 */

export type OutboxState = 'pending' | 'processing' | 'failed';

/** صف عام لطابور يعتمد على lease + state machine */
export type LeaseOutboxItem = {
  id: string;
  ownerId: string | null;
  operation: string;
  resourceId: string | null;
  payloadJson: string;
  idempotencyKey: string;
  state: OutboxState;
  attempts: number;
  createdAt: number;
  lastError: string | null;
  nextAttemptAt: number;
  leaseOwner: string | null;
  leaseUntil: number;
};

/** صف SQL الخام المقابل لـ LeaseOutboxItem */
export type LeaseOutboxRow = {
  id: string;
  owner_id: string | null;
  operation: string;
  resource_id: string | null;
  payload_json: string;
  idempotency_key: string;
  state: OutboxState;
  attempts: number;
  created_at: number;
  last_error: string | null;
  next_attempt_at: number;
  lease_owner: string | null;
  lease_until: number;
};

export function mapLeaseRow(row: LeaseOutboxRow): LeaseOutboxItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    operation: row.operation,
    resourceId: row.resource_id,
    payloadJson: row.payload_json,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    attempts: row.attempts,
    createdAt: row.created_at,
    lastError: row.last_error,
    nextAttemptAt: row.next_attempt_at,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until,
  };
}
