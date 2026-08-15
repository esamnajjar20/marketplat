/**
 * __tests__/unit/lib/userActiveStatus.test.ts
 *
 * FIX UX-13: locks in the shared user active/inactive status→color
 * mapping that replaced an inline ternary in AdminUsersTable.
 */
import { describe, it, expect } from 'vitest';
import {
  USER_ACTIVE_STATUS_VARIANT,
  USER_ACTIVE_STATUS_LABELS,
  userActiveKey,
} from '@/lib/userActiveStatus';

describe('userActiveStatus', () => {
  it('maps isActive=true to the active key', () => {
    expect(userActiveKey(true)).toBe('active');
  });

  it('maps isActive=false to the inactive key', () => {
    expect(userActiveKey(false)).toBe('inactive');
  });

  it('marks active as success and inactive as destructive', () => {
    expect(USER_ACTIVE_STATUS_VARIANT.active).toBe('success');
    expect(USER_ACTIVE_STATUS_VARIANT.inactive).toBe('destructive');
  });

  it('has a non-empty Arabic label for both states', () => {
    expect(USER_ACTIVE_STATUS_LABELS.active).toBeTruthy();
    expect(USER_ACTIVE_STATUS_LABELS.inactive).toBeTruthy();
  });
});
