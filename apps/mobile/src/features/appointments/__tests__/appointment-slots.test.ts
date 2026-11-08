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


describe('buildAppointmentSlots boundary conditions', () => {
  it('does not create a slot that crosses the requested market-calendar day', () => {
    const slots = buildAppointmentSlots([
      { start: '2026-11-05T21:00:00.000Z', end: '2026-11-05T23:30:00.000Z' },
    ], '2026-11-05', 0);
    expect(slots.every((slot) => slot.end.startsWith('2026-11-05'))).toBe(true);
    expect(slots).toEqual([]);
  });

  it('returns no slots for impossible calendar dates and invalid date shapes', () => {
    const range = { start: marketTime(5, 9), end: marketTime(5, 12) };
    expect(buildAppointmentSlots([range], '2026-02-30', 0)).toEqual([]);
    expect(buildAppointmentSlots([range], '05-11-2026', 0)).toEqual([]);
  });

  it('deduplicates heavily overlapping free ranges and keeps results chronologically sorted', () => {
    const slots = buildAppointmentSlots([
      { start: marketTime(5, 12), end: marketTime(5, 16) },
      { start: marketTime(5, 9), end: marketTime(5, 13) },
      { start: marketTime(5, 10), end: marketTime(5, 14) },
    ], '2026-11-05', 0);
    const starts = slots.map((slot) => slot.start);
    expect(new Set(starts).size).toBe(starts.length);
    expect(starts).toEqual([...starts].sort());
  });

  it('does not return slots when the requested range is fully in the past', () => {
    const slots = buildAppointmentSlots([
      { start: marketTime(5, 9), end: marketTime(5, 12) },
    ], '2026-11-05', new Date(marketTime(5, 12)).getTime());
    expect(slots).toEqual([]);
  });
});
