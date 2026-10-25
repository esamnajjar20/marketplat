/**
 * DESKTOP-AUDIT-02: no skip-to-content link existed anywhere in the
 * app — a keyboard-only user (desktop, no mouse) had to tab through
 * the full header + sidebar nav on every single page before reaching
 * the actual content, on every route group (public/protected/admin).
 *
 * Rendered once in the root layout, before everything else in <body>,
 * so it's unconditionally the first tab stop on every page regardless
 * of which route-group layout (public/protected/admin/auth) is
 * active underneath. Visually hidden (sr-only) until it receives
 * keyboard focus, at which point it becomes a visible, high-contrast
 * button pinned to the top of the viewport — the standard pattern
 * (WCAG 2.4.1, "Bypass Blocks").
 *
 * Targets #main-content, which each route-group layout's <main> (or,
 * for the (auth) group's single-column card layout, its content div)
 * now carries as an id. If a page is ever added with no ancestor
 * layout carrying that id, this link degrades to a no-op anchor jump
 * rather than an error — harmless, just not useful on that one page.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      تخطي إلى المحتوى الرئيسي
    </a>
  );
}
