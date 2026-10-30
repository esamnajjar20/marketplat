# Accessibility and Discoverability — 2026-10-30

## Scope

This implementation improves the shared Web and Expo/React Native experience without changing marketplace business rules, API contracts, route authorization, or the visual identity. The existing right-to-left Arabic experience is preserved. No new mobile dark mode or external UI/navigation dependency is introduced.

## Interaction and navigation rules

- Reachable web controls have a 44 CSS-pixel minimum block target; labelled icon-only controls also receive a 44-pixel minimum inline target.
- Mobile web form controls use a 16px minimum text size to avoid browser focus zoom and improve legibility.
- Keyboard focus remains visible; forced-colors mode receives explicit focus and selected-state indicators.
- Reduced-motion preferences remain respected by the existing global and route-navigation styles.
- Public, protected, authentication, and admin shells expose a focusable `main#main-content` target for the global skip link.
- Protected navigation disclosure controls identify their controlled panel and expose expanded state. Admin navigation controls expose their expanded/dialog relationship, and the mobile drawer receives focus on open and restores focus to its trigger on close.
- Status, warning, success, error, loading, and empty states in mobile shared UI expose accessibility roles/live-region semantics where appropriate.
- Mobile navigation exposes current/selected destinations; the closed drawer is removed from the accessibility tree, and restricted destinations explain that sign-in is required before navigation.

## Legibility and feedback

- Toasts use semantic design tokens instead of fixed light-only colors, increasing compatibility with the currently selected Web theme.
- Toast actions and close buttons meet the 44px target; titles and descriptions use more readable type sizes.
- Mobile design tokens and shared controls use validated foreground and border contrast values.
- Search, filter chips, form fields, checkout/editor controls, bottom navigation, and selected route states were improved on the audited mobile screens.

## Regression checks

Run from the relevant package directory:

```sh
# Web
cd frontend
node scripts/accessibility-visibility-audit.mjs
node scripts/app-shell-navigation-audit.mjs
node scripts/user-journey-shell-audit.mjs
node scripts/route-navigation-loading-audit.mjs
node scripts/design-system-token-contract-audit.mjs

# Mobile
cd apps/mobile
node scripts/run-all-verifications.mjs
node scripts/verify-design-system-a11y.mjs
node scripts/verify-design-tokens-no-raw-hex.mjs
node scripts/verify-navigation-drawer.mjs
node --test src/storage/__tests__/*.test.mjs
```

The web accessibility contract audit checks skip links and landmarks, target sizes, mobile input sizing, keyboard focus, forced colors, reduced motion, toast semantics, navigation labels, and disclosure relationships. The mobile design audit checks contrast, touch targets, shared field/search/chip states, warnings/errors, and critical screen controls.

## Verification boundary

The 2026-10-30 source-level verification passed 20/20 Web accessibility/discoverability checks, 18/18 shell-navigation checks, 6/6 journey checks, 65 route/loading checks, 23/23 design-token checks, 62/62 active mobile verification checks, 13/13 mobile design/accessibility checks, 30/30 storage tests, the drawer-specific checks, and TypeScript/TSX syntax transpilation for all changed TypeScript files.

These are regression and static checks, not a claim of full WCAG conformance. A dependency-backed TypeScript type-check, ESLint, browser Playwright execution, device/screen-reader testing (VoiceOver and TalkBack), keyboard-only end-to-end testing, and Android/iOS builds remain necessary before release. The mobile runner also reports 86 historical scripts as quarantined; they are not included in the 62 passing active checks.
