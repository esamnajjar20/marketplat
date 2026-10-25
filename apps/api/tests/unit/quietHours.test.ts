import { evaluateQuietHours, resolveQuietTimeZone } from '../../src/shared/utils/quietHours';

const P = {
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietHoursTimeZone: 'UTC',
};
const at = (iso: string) => new Date(iso);

describe('evaluateQuietHours', () => {
  it('is never blocked when disabled or prefs are junk', () => {
    expect(evaluateQuietHours({}, false, at('2026-10-02T23:00:00Z'))).toEqual({ blocked: false });
    expect(evaluateQuietHours(null, false)).toEqual({ blocked: false });
    expect(evaluateQuietHours([1], false)).toEqual({ blocked: false });
  });

  it('blocks inside a midnight-spanning window and reports time to the end', () => {
    expect(evaluateQuietHours(P, false, at('2026-10-02T23:00:00Z'))).toEqual({
      blocked: true,
      resumeInMs: 9 * 3600_000,
    });
    // 03:30:30 → 4h29m30s left
    expect(evaluateQuietHours(P, false, at('2026-10-02T03:30:30Z'))).toEqual({
      blocked: true,
      resumeInMs: (4 * 60 + 29) * 60_000 + 30_000,
    });
  });

  it('start is inclusive, end is exclusive', () => {
    expect(evaluateQuietHours(P, false, at('2026-10-02T22:00:00Z')).blocked).toBe(true);
    expect(evaluateQuietHours(P, false, at('2026-10-02T08:00:00Z')).blocked).toBe(false);
  });

  it('handles a same-day window', () => {
    const S = { ...P, quietHoursStart: '13:00', quietHoursEnd: '15:00' };
    expect(evaluateQuietHours(S, false, at('2026-10-02T14:00:00Z'))).toEqual({
      blocked: true,
      resumeInMs: 3600_000,
    });
    expect(evaluateQuietHours(S, false, at('2026-10-02T15:00:00Z')).blocked).toBe(false);
  });

  it('urgent bypasses unless quietHoursAllowUrgent is false', () => {
    expect(evaluateQuietHours(P, true, at('2026-10-02T23:00:00Z')).blocked).toBe(false);
    expect(
      evaluateQuietHours({ ...P, quietHoursAllowUrgent: false }, true, at('2026-10-02T23:00:00Z')).blocked,
    ).toBe(true);
  });

  it('start === end means no window', () => {
    expect(evaluateQuietHours({ ...P, quietHoursEnd: '22:00' }, false, at('2026-10-02T23:00:00Z')).blocked).toBe(false);
  });

  it('evaluates in the user zone', () => {
    // 20:30Z is 23:30 in Asia/Gaza (UTC+3 in October 2026) → inside 22:00–08:00
    expect(
      evaluateQuietHours({ ...P, quietHoursTimeZone: 'Asia/Gaza' }, false, at('2026-10-02T20:30:00Z')).blocked,
    ).toBe(true);
  });
});

describe('resolveQuietTimeZone', () => {
  it('falls back to Asia/Gaza for invalid zones', () => {
    expect(resolveQuietTimeZone('Mars/X')).toBe('Asia/Gaza');
    expect(resolveQuietTimeZone(undefined)).toBe('Asia/Gaza');
  });
});
