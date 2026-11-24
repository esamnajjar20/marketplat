import { describe, expect, it } from 'vitest';
import { normalizePhoneDigits } from '../normalize-phone';

describe('normalizePhoneDigits', () => {
  it('converts Arabic-Indic digits', () => {
    expect(normalizePhoneDigits('+٩٧٢٥٩١٢٣٤٥٦٧')).toBe('+972591234567');
  });

  it('converts Eastern Arabic-Indic digits', () => {
    expect(normalizePhoneDigits('+۹۷۲۵۹۱۲۳۴۵۶۷')).toBe('+972591234567');
  });

  it('preserves punctuation so invalid formatting is still rejected by the API contract', () => {
    expect(normalizePhoneDigits('+972-59-123-4567')).toBe('+972-59-123-4567');
  });
});
