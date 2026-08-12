/**
 * __tests__/unit/lib/serviceRequestStatus.test.ts
 *
 * Previously uncovered. Shared between MyServiceRequestsList (customer
 * side) and IncomingServiceRequestsList (provider side) — the same
 * status values render differently depending on whose list it is, so a
 * missing/wrong entry here shows up as a broken badge on both sides of
 * the service-request flow at once.
 */
import { describe, it, expect } from 'vitest';
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_VARIANT,
} from '@/lib/serviceRequestStatus';
import type { ServiceRequestStatus } from '@/types/service.types';

const ALL_STATUSES: ServiceRequestStatus[] = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

describe('serviceRequestStatus', () => {
  it('has a non-empty Arabic label for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(SERVICE_REQUEST_STATUS_LABELS[status]).toBeTruthy();
      expect(typeof SERVICE_REQUEST_STATUS_LABELS[status]).toBe('string');
    }
  });

  it('has a badge variant for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(SERVICE_REQUEST_STATUS_VARIANT[status]).toBeTruthy();
    }
  });

  it('marks REJECTED and CANCELLED as destructive', () => {
    expect(SERVICE_REQUEST_STATUS_VARIANT.REJECTED).toBe('destructive');
    expect(SERVICE_REQUEST_STATUS_VARIANT.CANCELLED).toBe('destructive');
  });

  it('marks ACCEPTED and IN_PROGRESS as success (active, healthy states)', () => {
    expect(SERVICE_REQUEST_STATUS_VARIANT.ACCEPTED).toBe('success');
    expect(SERVICE_REQUEST_STATUS_VARIANT.IN_PROGRESS).toBe('success');
  });

  it('marks PENDING as warning (needs attention, not yet resolved)', () => {
    expect(SERVICE_REQUEST_STATUS_VARIANT.PENDING).toBe('warning');
  });

  it('only defines the six known statuses (no stale/extra keys)', () => {
    expect(Object.keys(SERVICE_REQUEST_STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(SERVICE_REQUEST_STATUS_VARIANT).sort()).toEqual([...ALL_STATUSES].sort());
  });
});
