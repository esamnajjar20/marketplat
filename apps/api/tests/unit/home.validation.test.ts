import { getHomepageSchema, HOME_CITIES } from '../../src/modules/home/home.validation';

/**
 * HOME_CITIES mirrors frontend/lib/constants.ts → CITIES. The two lists live
 * in different packages, so this literal pin (repeated in the frontend's
 * cities test) makes drift fail in CI on whichever side changes alone.
 */
const EXPECTED_CITIES = [
  'غزة', 'خان يونس', 'رفح', 'دير البلح', 'بيت لاهيا',
  'بيت حانون', 'جباليا', 'النصيرات', 'المغازي', 'البريج',
];

describe('home.validation', () => {
  it('HOME_CITIES matches the frontend CITIES list', () => {
    expect([...HOME_CITIES]).toEqual(EXPECTED_CITIES);
  });

  it('keeps a known city (normalising whitespace)', () => {
    const { query } = getHomepageSchema.parse({ query: { city: '  خان   يونس ' } });
    expect(query.city).toBe('خان يونس');
  });

  it('treats an unknown city as no city', () => {
    const { query } = getHomepageSchema.parse({ query: { city: 'Gaza' } });
    expect(query.city).toBeUndefined();
  });
});
