import { describe, expect, it } from 'vitest';
import { classifyHttpConflict } from '@/lib/conflictResolver';
import { queueFailureAction, describeQueueFailure, type QueuedRequestSummary } from '@/lib/offlineQueue';

function item(status: number, message?: string): QueuedRequestSummary {
  return {
    id: 1,
    url: '/api/test/1',
    method: 'PATCH',
    queuedAt: Date.now(),
    status: 'failed',
    lastError: { status, message },
  };
}

describe('offline 409/412 conflict UX', () => {
  it('treats 412 as a version/precondition conflict requiring review', () => {
    const info = classifyHttpConflict(412);
    expect(info.kind).toBe('version_conflict');
    expect(info.primaryAction).toBe('edit');
    expect(info.isTerminal).toBe(true);
  });

  it('treats a temporary 409 lock as retryable', () => {
    const message = 'Item is currently being updated by another request — try again shortly';
    const info = classifyHttpConflict(409, message);
    expect(info.kind).toBe('temporary_conflict');
    expect(info.primaryAction).toBe('retry');
    expect(info.isTerminal).toBe(false);
    expect(queueFailureAction(item(409, message))).toBe('retry');
  });

  it('does not pretend every 409 is a version conflict', () => {
    const info = classifyHttpConflict(409, 'A record with this value already exists');
    expect(info.kind).toBe('other_client');
    expect(info.primaryAction).toBe('edit');
    expect(describeQueueFailure(item(409, info.message))).toContain('تعارض');
  });

  it('does not offer a fake keep-server/keep-local merge for 412', () => {
    const info = classifyHttpConflict(412);
    expect(info.message).toContain('لم يُطبَّق التغيير');
    expect(info.message).not.toContain('الاحتفاظ بالمحلي');
    expect(info.message).not.toContain('الاحتفاظ بالسيرفر');
  });
});
