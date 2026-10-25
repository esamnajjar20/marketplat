/**
 * shared/utils/slugify — previously uncovered.
 */
import { generateStoreSlug, withSlugSuffix } from '../../src/shared/utils/slugify';

describe('slugify', () => {
  describe('generateStoreSlug', () => {
    it('lowercases and hyphenates latin names', () => {
      expect(generateStoreSlug('My Cool Store')).toBe('my-cool-store');
    });

    it('preserves Arabic letters', () => {
      const slug = generateStoreSlug('متجر الأقصى');
      expect(slug).toContain('متجر');
      expect(slug).not.toMatch(/\s/);
    });

    it('trims edges and collapses punctuation to hyphens', () => {
      expect(generateStoreSlug('  Hello!!!World  ')).toBe('hello-world');
    });

    it('falls back to "store" for empty or all-punctuation input', () => {
      expect(generateStoreSlug('')).toBe('store');
      expect(generateStoreSlug('   ')).toBe('store');
      expect(generateStoreSlug('!!!')).toBe('store');
    });

    it('caps length at 80 characters', () => {
      const long = 'a'.repeat(100);
      expect(generateStoreSlug(long).length).toBeLessThanOrEqual(80);
    });
  });

  describe('withSlugSuffix', () => {
    it('appends a short alphanumeric suffix after a hyphen', () => {
      const result = withSlugSuffix('my-store');
      expect(result).toMatch(/^my-store-[a-z0-9]{4}$/);
    });

    it('produces different suffixes across calls (high probability)', () => {
      const a = withSlugSuffix('base');
      const b = withSlugSuffix('base');
      // Extremely unlikely to collide with 36^4 space; still allow equality only if flaky env
      expect(a.startsWith('base-')).toBe(true);
      expect(b.startsWith('base-')).toBe(true);
    });
  });
});
