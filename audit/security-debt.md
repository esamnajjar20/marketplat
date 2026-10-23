# Security Debt (Remaining Vulnerabilities)

## Critical (Requires Breaking Changes)
- **Next.js 15.5.28 → 16.4.2**: SVG RCE in Image Optimization API.
  - **Mitigation:** Ensure no user-uploaded SVG files pass through next/image. Audit all image sources.
  - **Plan:** Upgrade to Next 16 in a dedicated branch with full regression testing.

- **Vitest 4.x → 5.0.5**: Prototype pollution RCE in tinypool.
  - **Mitigation:** Only affects test environment, not production.
  - **Plan:** Upgrade alongside Next 16 upgrade.

## High (Requires Breaking Changes)
- **Tailwind 3 → 4**: braces DoS.
- **glob (via @opennextjs/cloudflare)**: command injection.
- **postcss (via next)**: XSS/path traversal.

## Recommended Actions
1. Verify SVG uploads are blocked at the API level.
2. Schedule a dedicated upgrade week for Next 16 + Tailwind 4.
3. Do NOT run `npm audit fix --force` on main branch.

**Date documented:** 2026-10-23
**Documented by:** Performance Audit Campaign
