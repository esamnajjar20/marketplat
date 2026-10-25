/**
 * i18n/ar barrel + error helpers — / P3.
 * common.ts is intentionally empty (export {} only) and excluded from
 * coverage in vitest.config.ts.
 */
import { describe, it, expect } from 'vitest';
import { errorMessages, getErrorMessage } from '@/lib/i18n/ar';
import { translateFieldIssue } from '@/lib/i18n/ar/fieldErrors';

describe('i18n/ar index barrel', () => {
  it('re-exports errorMessages map with known codes', () => {
    expect(errorMessages).toBeTypeOf('object');
    expect(errorMessages.VALIDATION_ERROR).toBeDefined();
    expect(errorMessages.UNAUTHORIZED).toBeDefined();
  });

  it('getErrorMessage returns Arabic for VALIDATION_ERROR', () => {
    const msg = getErrorMessage('VALIDATION_ERROR');
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe('string');
    expect(msg!.length).toBeGreaterThan(0);
  });

  it('getErrorMessage returns Arabic for UNAUTHORIZED', () => {
    expect(getErrorMessage('UNAUTHORIZED')).toMatch(/تسجيل|جلسة/);
  });

  it('getErrorMessage returns undefined for completely unknown codes', () => {
    expect(getErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ')).toBeUndefined();
  });
});

describe('fieldErrors translateFieldIssue', () => {
  it('builds an Arabic sentence for a too_small string issue on title', () => {
    const text = translateFieldIssue('title', {
      code: 'too_small',
      minimum: 5,
      type: 'string',
    } as never);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });
});
