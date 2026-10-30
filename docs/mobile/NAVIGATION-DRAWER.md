# Navigation Drawer — MarketPlat Mobile

## Implementation choice

MarketPlat uses Expo Router with a shared root `Stack`. The drawer is implemented with React Native `Animated` and `PanResponder` instead of adding `@react-navigation/drawer`; that avoids a second navigation container and avoids changing native dependencies/lockfile solely for this UI component.

## Included behavior

- Opens from the shared menu button in `src/components/ui/AppHeader.tsx` and the custom home header in `app/index.tsx`.
- Opens with a horizontal swipe from the screen edge. Arabic/RTL opens from the right; LTR opens from the left.
- Closes when a route is selected, the shaded backdrop is pressed, the drawer is swiped closed, or Android Back is pressed.
- Uses real Expo Router paths, highlights the active route, and sends signed-out users to `/login` when they choose an auth-only destination.
- Uses the MarketPlat app icon, the authenticated user's name/email, shared theme tokens, accessible labels/state, and touch targets of at least 44 points.
- Login/logout action is placed at the bottom; logout delegates to the existing `AuthContext.logout()` flow so pending offline operations keep their existing confirmation behavior.

## Files

- `apps/mobile/src/components/MobileDrawer.tsx`: provider, hook, trigger button, menu data, overlay, gestures, and styling.
- `apps/mobile/src/components/Icons.tsx`: shared glyphs used by the menu.
- `apps/mobile/src/components/ui/AppHeader.tsx`: menu trigger on common screens.
- `apps/mobile/app/index.tsx`: menu trigger on the custom home header.
- `apps/mobile/app/_layout.tsx`: mounts `MobileDrawerProvider` in `RootChrome` above the stack and bottom navigation.
- `apps/mobile/scripts/verify-navigation-drawer.mjs`: verifies registered routes and key accessibility/navigation invariants.

## Customizing the menu

Edit `DRAWER_ITEMS` in `src/components/MobileDrawer.tsx`. Each item has `label`, `path`, `icon`, `section`, and optional `requiresAuth`. The route must correspond to an existing Expo Router file under `app/`. Available glyphs are defined in `src/components/Icons.tsx`; colors, spacing, and typography come from `src/theme/tokens.ts`.

## Verification

From `apps/mobile`:

```bash
node scripts/verify-navigation-drawer.mjs
node scripts/run-all-verifications.mjs
node --test src/storage/__tests__/*.test.mjs
pnpm run type-check
pnpm run lint
pnpm run test:sqlite
```

The first three commands were run in the current environment and passed. The TypeScript type-check, lint command, Vitest suite, and native Android build still require the project's dependencies/toolchain to be installed. A real RTL device/emulator test is still recommended to verify touch gestures and layout feel on Android and iOS.
