export {
  OUTBOX_MAX_PENDING,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_RETRY_BASE_DELAY_MS,
  OUTBOX_RETRY_MAX_DELAY_MS,
  OUTBOX_DEFAULT_LEASE_MS,
  OUTBOX_ID_MAX_LENGTH,
  OUTBOX_MAX_PAYLOAD_CHARS,
  OUTBOX_DATABASE_NAME,
  OUTBOX_OP_ID_PATTERN,
  computeRetryDelayMs,
} from './constants';

export type { OutboxState, LeaseOutboxItem, LeaseOutboxRow } from './types';
export { mapLeaseRow } from './types';

export {
  buildLeaseTableSql,
  ensureLeaseColumns,
  recoverExpiredLeases,
  getOldestItem,
  claimItem,
  acknowledgeItem,
  markItemFailed,
  countActiveItems,
  listItems,
  listPendingDue,
  listExhausted,
  clearNonProcessing,
  type LeaseTableConfig,
} from './core';
