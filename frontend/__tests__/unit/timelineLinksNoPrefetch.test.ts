/**
 * Regression guard: Timeline rows link to ads/stores/conversations that may have
 * been deleted or expired since the activity was recorded. Viewport prefetch of
 * those links fired bursts of 404 _rsc requests. Checked statically because the
 * prop is not observable in the rendered DOM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Timeline links do not prefetch', () => {
  it('every <Link> in Timeline.tsx has prefetch={false}', () => {
    const src = readFileSync(resolve(__dirname, '../../components/profile/Timeline.tsx'), 'utf8');
    const links = (src.match(/<Link\b/g) ?? []).length;
    const optedOut = (src.match(/prefetch=\{false\}/g) ?? []).length;
    expect(links).toBeGreaterThan(0);
    expect(optedOut).toBeGreaterThanOrEqual(links);
  });
});
