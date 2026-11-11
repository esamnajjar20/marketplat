import { describe, expect, it } from 'vitest';
import { emptyWeeklyHours, normalizeWeeklyHours, setDayTime, toggleDay, validateWeeklyHours } from '../weekly-hours';

describe('weekly-hours', () => {
  it('normalizes missing or malformed server data into a full closed week', () => {
    expect(normalizeWeeklyHours(null)).toEqual(emptyWeeklyHours());
    const result = normalizeWeeklyHours({ sun: { open: '08:00', close: '12:00' }, mon: { open: 5 }, xyz: {} });
    expect(result.sun).toEqual({ open: '08:00', close: '12:00' });
    expect(result.mon).toBeNull();
  });
  it('toggles a day with default hours and edits a single field', () => {
    const opened = toggleDay(emptyWeeklyHours(), 'tue');
    expect(opened.tue).toEqual({ open: '09:00', close: '17:00' });
    expect(toggleDay(opened, 'tue').tue).toBeNull();
    expect(setDayTime(opened, 'tue', 'close', '20:30').tue).toEqual({ open: '09:00', close: '20:30' });
  });
  it('validates format and ordering with a day-specific Arabic message', () => {
    expect(validateWeeklyHours(emptyWeeklyHours())).toBeNull();
    expect(validateWeeklyHours({ ...emptyWeeklyHours(), wed: { open: '09:00', close: '17:00' } })).toBeNull();
    expect(validateWeeklyHours({ ...emptyWeeklyHours(), thu: { open: '17:00', close: '09:00' } })).toContain('الخميس');
    expect(validateWeeklyHours({ ...emptyWeeklyHours(), sat: { open: '9:00', close: '17:00' } })).toContain('السبت');
  });
});
