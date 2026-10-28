/**
 * regression guard.
 *
 * Every <Link> on the always-mounted homepage path must opt out of Next's
 * default viewport prefetch: each one costs an RSC request (a Worker
 * invocation) on EVERY page load. Checked statically because the prop is
 * not observable in the rendered DOM.
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

describe('homepage links do not prefetch on load', () => {
  it.each(FILES)('%s: every <Link> has prefetch={false}', (file) => {
    const src = readFileSync(resolve(__dirname, '../../', file), 'utf8');
    const links = (src.match(/<Link\b/g) ?? []).length;
    const optedOut = (src.match(/prefetch=\{false\}/g) ?? []).length;
    expect(links).toBeGreaterThan(0);
    expect(optedOut).toBeGreaterThanOrEqual(links);
  });
});
