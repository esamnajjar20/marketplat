import { describe, expect, it } from 'vitest';
import { buildAppointmentSlots } from '../appointment-slots';

// These fixed November instants use Asia/Gaza standard time (UTC+2),
// independent of the timezone configured on the test runner/device.
const marketTime = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 2, minute)).toISOString();

describe('buildAppointmentSlots', () => {
  it('offers one-hour choices every 30 minutes within a confirmed free range', () => {
    const slots = buildAppointmentSlots(
      [{ start: marketTime(5, 9), end: marketTime(5, 11) }],
      '2026-11-05',
      new Date(marketTime(4, 12)).getTime(),
    );
    expect(slots.map((slot) => slot.label)).toEqual(['09:00 – 10:00', '09:30 – 10:30', '10:00 – 11:00']);
  });

  it('does not return past or too-short ranges', () => {
    const now = new Date(marketTime(5, 10)).getTime();
    const slots = buildAppointmentSlots([
      { start: marketTime(5, 9), end: marketTime(5, 10, 45) },
      { start: marketTime(5, 10), end: marketTime(5, 11, 30) },
    ], '2026-11-05', now);
    expect(slots.map((slot) => slot.label)).toEqual(['10:30 – 11:30']);
  });

  it('aligns selectable starts to predictable 30-minute boundaries', () => {
    const slots = buildAppointmentSlots([
      { start: marketTime(5, 9, 15), end: marketTime(5, 11, 15) },
    ], '2026-11-05', new Date(marketTime(4, 12)).getTime());
    expect(slots.map((slot) => slot.label)).toEqual(['09:30 – 10:30', '10:00 – 11:00']);
  });

  it('uses the market calendar even when a UTC instant belongs to the previous UTC day', () => {
    const slots = buildAppointmentSlots([
      { start: '2026-11-03T22:00:00.000Z', end: '2026-11-03T23:30:00.000Z' },
    ], '2026-11-04', 0);
    expect(slots.map((slot) => slot.label)).toEqual(['00:00 – 01:00', '00:30 – 01:30']);
  });

  it('ignores invalid ranges, duplicate starts, and malformed dates', () => {
    const range = { start: marketTime(5, 12), end: marketTime(5, 14) };
    const slots = buildAppointmentSlots([range, range, { start: 'invalid', end: 'also-invalid' }], '2026-11-05', new Date(marketTime(4, 0)).getTime());
    expect(slots).toHaveLength(3);
    expect(buildAppointmentSlots([range], '2026-13-55', 0)).toHaveLength(0);
  });
});
