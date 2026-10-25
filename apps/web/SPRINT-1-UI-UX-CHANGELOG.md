# UI/UX Sprint 1 — Design System Foundation

## Scope

This sprint strengthens the existing visual system without redesigning product pages.

### Added
- Semantic typography utilities (`text-ui-*`).
- Shared spacing, control-height, touch-target, and z-index tokens.
- `EmptyState` reusable component for list/search/dashboard empty states.
- `Field` reusable form wrapper with label, hint, required marker, and accessible error state.
- `StatusBadge` semantic status component to centralize status-tone mapping.

### Improved
- Shared button geometry now consumes the control-height tokens.
- Inputs use the shared control height and expose invalid state styling through `aria-invalid`.
- Interactive cards expose a visible focus-within state.
- Skeletons are hidden from assistive technology because they are decorative loading UI.

### Compatibility
- No page-level navigation or business logic was changed in Sprint 1.
- Existing tokens and dark/RTL behavior are preserved.
