/**
 * UI store — Zustand (no persistence).
 *
 * Manages transient UI state that doesn't belong in component state:
 *  - Mobile navigation open/closed
 *
 * FIX DEAD-07: isGlobalLoading, searchQuery, and theme were all defined
 * with full actions/selectors but never read or set anywhere in the
 * app — theme in particular duplicated next-themes (see
 * providers/ThemeProvider.tsx), which is the app's actual theme
 * source. Removed rather than left as unused surface to maintain;
 * isMobileNavOpen is the one field here MobileNav.tsx actually uses.
 */
import { create } from 'zustand';

interface UIStore {
  // ── State ────────────────────────────────────────────────────────
  isMobileNavOpen: boolean;

  // ── Actions ──────────────────────────────────────────────────────
  openMobileNav:    () => void;
  closeMobileNav:   () => void;
  toggleMobileNav:  () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  // ── Initial state ─────────────────────────────────────────────
  isMobileNavOpen: false,

  // ── Actions ───────────────────────────────────────────────────
  openMobileNav:   () => set({ isMobileNavOpen: true }),
  closeMobileNav:  () => set({ isMobileNavOpen: false }),
  toggleMobileNav: () => set((s) => ({ isMobileNavOpen: !s.isMobileNavOpen })),
}));

// ── Selectors ─────────────────────────────────────────────────────
export const selectIsMobileNavOpen = (s: UIStore) => s.isMobileNavOpen;
