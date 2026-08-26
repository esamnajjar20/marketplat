/**
 * UI store — Phase 4 / P3.
 * Only isMobileNavOpen remains (DEAD-07 removed unused theme/loading fields).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({ isMobileNavOpen: false });
  });

  it('starts with mobile nav closed', () => {
    expect(useUIStore.getState().isMobileNavOpen).toBe(false);
    expect(selectIsMobileNavOpen(useUIStore.getState())).toBe(false);
  });

  it('openMobileNav sets isMobileNavOpen true', () => {
    useUIStore.getState().openMobileNav();
    expect(useUIStore.getState().isMobileNavOpen).toBe(true);
  });

  it('closeMobileNav sets isMobileNavOpen false', () => {
    useUIStore.getState().openMobileNav();
    useUIStore.getState().closeMobileNav();
    expect(useUIStore.getState().isMobileNavOpen).toBe(false);
  });

  it('toggleMobileNav flips the flag', () => {
    useUIStore.getState().toggleMobileNav();
    expect(useUIStore.getState().isMobileNavOpen).toBe(true);
    useUIStore.getState().toggleMobileNav();
    expect(useUIStore.getState().isMobileNavOpen).toBe(false);
  });
});
