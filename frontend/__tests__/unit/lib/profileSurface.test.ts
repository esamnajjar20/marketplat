/**
 * __tests__/unit/lib/profileSurface.test.ts
 */
import { describe, it, expect } from 'vitest';
import { PROFILE_SURFACE } from '@/lib/profileSurface';

describe('PROFILE_SURFACE', () => {
  it('defines accent and soft backgrounds for store, seller, and service', () => {
    expect(PROFILE_SURFACE.store.accentBar).toContain('primary');
    expect(PROFILE_SURFACE.seller.accentBar).toContain('amber');
    expect(PROFILE_SURFACE.service.accentBar).toContain('teal');
    expect(PROFILE_SURFACE.store.softBg).toBeTruthy();
    expect(PROFILE_SURFACE.seller.softBg).toBeTruthy();
    expect(PROFILE_SURFACE.service.softBg).toBeTruthy();
  });
});
