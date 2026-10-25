/**
 * __tests__/unit/lib/appointmentStatus.test.ts
 *
 * Previously uncovered. These two Record<AppointmentStatus, ...> maps
 * are shared between AppointmentsList and any future appointment detail
 * view. Because TypeScript's Record<Enum, T> only catches a missing key
 * at compile time (and only if the AppointmentStatus union itself is
 * kept in sync), a status value that exists at runtime but isn't listed
 * here would render `undefined` for a badge label/variant with no
 * type error — this test catches that at the value level instead of
 * relying on the type system alone.
 */
import { describe, it, expect } from 'vitest';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
} from '@/lib/appointmentStatus';
import type { AppointmentStatus } from '@/types/service.types';

const ALL_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

describe('appointmentStatus', () => {
  it('has a non-empty Arabic label for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(APPOINTMENT_STATUS_LABELS[status]).toBeTruthy();
      expect(typeof APPOINTMENT_STATUS_LABELS[status]).toBe('string');
    }
  });

  it('has a badge variant for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(APPOINTMENT_STATUS_VARIANT[status]).toBeTruthy();
    }
  });

  it('marks CANCELLED and NO_SHOW as destructive (negative outcomes)', () => {
    expect(APPOINTMENT_STATUS_VARIANT.CANCELLED).toBe('destructive');
    expect(APPOINTMENT_STATUS_VARIANT.NO_SHOW).toBe('destructive');
  });

  it('does not mark SCHEDULED or COMPLETED as destructive', () => {
    expect(APPOINTMENT_STATUS_VARIANT.SCHEDULED).not.toBe('destructive');
    expect(APPOINTMENT_STATUS_VARIANT.COMPLETED).not.toBe('destructive');
  });

  it('only defines the four known statuses (no stale/extra keys)', () => {
    expect(Object.keys(APPOINTMENT_STATUS_LABELS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(APPOINTMENT_STATUS_VARIANT).sort()).toEqual([...ALL_STATUSES].sort());
  });
});
