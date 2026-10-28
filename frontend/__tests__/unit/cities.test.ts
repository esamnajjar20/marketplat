import { describe, it, expect } from 'vitest';
import { CITIES } from '@/lib/constants';

/**
 * CITIES mirrors backend/src/modules/home/home.validation.ts → HOME_CITIES.
 * Literal pin, repeated in the backend test: drift fails on whichever side
 * changes alone (an unknown city silently becomes "no city" in /home).
 */
describe('CITIES', () => {
  it('matches the backend HOME_CITIES list', () => {
    expect([...CITIES]).toEqual([
      'غزة', 'خان يونس', 'رفح', 'دير البلح', 'بيت لاهيا',
      'بيت حانون', 'جباليا', 'النصيرات', 'المغازي', 'البريج',
    ]);
  });
});
