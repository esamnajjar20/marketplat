/**
 * اختبارات خفيفة لثوابت ونواة الـ Outbox (المرحلة 2/3).
 * تشغيل: npx vitest run src/storage/__tests__/outbox-constants.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_MAX_PENDING,
  OUTBOX_RETRY_BASE_DELAY_MS,
  OUTBOX_RETRY_MAX_DELAY_MS,
  computeRetryDelayMs,
} from '../outbox/constants';
import { mapLeaseRow, type LeaseOutboxRow } from '../outbox/types';

describe('outbox constants', () => {
  it('exposes sensible defaults', () => {
    expect(OUTBOX_MAX_PENDING).toBeGreaterThan(0);
    expect(OUTBOX_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(OUTBOX_RETRY_BASE_DELAY_MS).toBe(5_000);
    expect(OUTBOX_RETRY_MAX_DELAY_MS).toBe(60 * 60 * 1_000);
  });

  it('computeRetryDelayMs grows exponentially and caps', () => {
    expect(computeRetryDelayMs(1)).toBe(OUTBOX_RETRY_BASE_DELAY_MS);
    expect(computeRetryDelayMs(2)).toBe(OUTBOX_RETRY_BASE_DELAY_MS * 2);
    expect(computeRetryDelayMs(3)).toBe(OUTBOX_RETRY_BASE_DELAY_MS * 4);
    expect(computeRetryDelayMs(20)).toBe(OUTBOX_RETRY_MAX_DELAY_MS);
  });
});

describe('mapLeaseRow', () => {
  it('maps snake_case row to camelCase item', () => {
    const row: LeaseOutboxRow = {
      id: '1',
      owner_id: 'u1',
      operation: 'create-ad',
      resource_id: null,
      payload_json: '{}',
      idempotency_key: 'k1',
      state: 'pending',
      attempts: 0,
      created_at: 1000,
      last_error: null,
      next_attempt_at: 0,
      lease_owner: null,
      lease_until: 0,
    };
    const item = mapLeaseRow(row);
    expect(item.ownerId).toBe('u1');
    expect(item.idempotencyKey).toBe('k1');
    expect(item.state).toBe('pending');
  });
});
