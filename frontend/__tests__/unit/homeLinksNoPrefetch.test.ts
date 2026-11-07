/**
 * regression guard.
 *
 * Home surfaces remain out of automatic viewport prefetch. The project Link
 * adapter turns these opt-outs into hover/focus intent prefetch, avoiding a
 * request burst on every page load without leaving desktop/keyboard navigation cold.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES = [
  'components/home/CategoriesRow.tsx',
  'components/home/SectionHeader.tsx',
  'components/home/FeaturedCarousel.tsx',
  'components/home/ForYouMixedSection.tsx',
  'components/layout/PublicFooter.tsx',
];

describe('homepage links defer automatic prefetch', () => {
  it.each(FILES)('%s: uses the intent-aware Link adapter', (file) => {
    const src = readFileSync(resolve(__dirname, '../../', file), 'utf8');
    const links = (src.match(/<IntentPrefetchLink\b/g) ?? []).length;
    const optedOut = (src.match(/prefetch=\{false\}/g) ?? []).length;
    expect(src).toContain("from '@/components/navigation/IntentPrefetchLink'");
    expect(links).toBeGreaterThan(0);
    expect(optedOut).toBe(links);
  });
});
