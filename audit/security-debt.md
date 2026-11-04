# Frontend security debt — refreshed 2026-11-04

This document supersedes the outdated Next.js recommendation recorded on
2026-10-23. The installed versions below were read from
`frontend/package-lock.json`, not inferred from semver ranges.

## Immediate dependency patch — not yet applied in this checkout

| Package | Locked version | Required patched version | Reason |
|---|---:|---:|---|
| `next` | `15.5.28` | `15.5.29` | Next.js security release dated 2026-11-03 (seven advisories, including Edge cookie-header disclosure and image-optimizer SVG rejection bypass) |
| `eslint-config-next` | `15.5.28` | `15.5.29` | Keep lint rules aligned with the patched Next.js minor line |
| `react` | `19.2.8` | `19.2.9` | React Server Components transport RCE advisory affects 19.2.0–19.2.8 |
| `react-dom` | `19.2.8` | `19.2.9` | Keep React and React DOM aligned |

Recommended command from `frontend/` when npm registry access is available:

```bash
npm install next@15.5.29 eslint-config-next@15.5.29 react@19.2.9 react-dom@19.2.9
npm ci
npm audit --omit=dev --audit-level=high
npm run type-check
npm run lint
npm test -- --run
npm run build
```

Do not edit only `package.json`: `package-lock.json` must be regenerated and
committed together. In this audit environment the npm registry request timed
out and the project has no `node_modules`; consequently this dependency patch
has **not** been represented as complete and the lockfile remains unchanged.

## Advisory context

- The 2026-10-14 Next.js security release raised the patched Next 15 line to
  `15.5.28`; the installed version already includes that earlier fix. The
  previous statement that the project must jump directly to Next 16.4.2 for
  that October issue was outdated.
- A newer Next.js security release on 2026-11-03 raised the patched Next 15
  line to `15.5.29`. Relevant issues include cache-isolation conditions,
  Edge route cookie-header disclosure when `NextResponse.cookies.set()` is
  used in affected Edge handlers, and an SVG rejection bypass in Image
  Optimization under specified native-backend conditions.
- React's RSC transport RCE advisory lists React Server Component packages
  through `19.2.8` as affected and `19.2.9` as patched.

## Code/configuration risks to retain in the deployment checklist

1. `images.remotePatterns` in `next.config.ts` uses `/**` for Cloudinary when
   `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is absent. Supply the real cloud name at
   build time in production. The wildcard is retained for compatibility in
   this code review; removing it without verifying all deploy environments
   could break the image pipeline.
2. `middleware.ts` forwards a fresh CSP on both the request and response so
   Next can attach nonces to framework scripts. Nonce-bearing HTML must remain
   private/no-store at the browser and CDN layers. Check Cloudflare Cache Rules
   do not override `no-store` for document or RSC responses.
3. The debug-toggle Route Handler uses `NextResponse.cookies.set()` but does
   not declare the Edge runtime; Next Route Handlers default to the Node.js
   runtime. Preserve that runtime unless the adapter/runtime compatibility
   and the current cookie advisory are re-reviewed.
4. The API catch-all proxies upstream responses. The response-desynchronization
   advisory is conditional on a particular self-hosted HTTP/1.1 reverse-proxy
   and pipelining topology. The primary OpenNext Worker deployment differs,
   but the standalone Docker deployment should be re-reviewed behind its
   actual reverse proxy and patched Next version.
5. Verify uploaded media policy in the Express API: reject or sanitize SVG at
   upload time, not only in the frontend image component.

## Next.js line strategy

Remain on the patched Next 15 Maintenance LTS line for the immediate security
patch. Next 15 Maintenance LTS support is extended through 2027-01-31. Treat a
Next 16 migration as a separate compatibility project because this repo uses
OpenNext Cloudflare and the deployed middleware/runtime support must be tested
before changing the convention from `middleware.ts` to `proxy.ts`.
