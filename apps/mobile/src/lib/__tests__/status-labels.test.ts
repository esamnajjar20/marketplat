import { describe, expect, it } from 'vitest';
import { roleLabel, statusLabel } from '../status-labels';

describe('Arabic status and role labels', () => {
  it.each([
    ['active', 'نشط'], ['IN_PROGRESS', 'قيد التنفيذ'], ['no_show', 'لم يحضر'],
    ['requires_action', 'يتطلب إجراءً'], ['provider', 'مقدم خدمة'],
  ])('maps %s to its Arabic label', (value, expected) => {
    expect(statusLabel(value)).toBe(expected);
  });

  it('returns the explicit unknown label for missing statuses', () => {
    expect(statusLabel()).toBe('غير محدد');
    expect(statusLabel(null)).toBe('غير محدد');
    expect(statusLabel('')).toBe('غير محدد');
  });

  it('preserves readable unknown statuses while replacing underscores', () => {
    expect(statusLabel('CUSTOM_REVIEW_STATE')).toBe('CUSTOM REVIEW STATE');
  });

  it('uses the member fallback for missing roles and maps known roles', () => {
    expect(roleLabel()).toBe('عضو');
    expect(roleLabel(null)).toBe('عضو');
    expect(roleLabel('manager')).toBe('مدير');
    expect(roleLabel('CUSTOM_ROLE')).toBe('CUSTOM_ROLE');
  });
});
