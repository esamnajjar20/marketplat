# MarketPlat — Stage 5: image, font, navigation and Core Web Vitals readiness

## Changes

- Apply the configured Cairo face to the document via `font-sans`; previously the root attached its CSS variable but did not apply the Tailwind font utility to `<body>`.
- Remove the unused IBM Plex Sans Arabic font download. The retained `font-sans-arabic` utility aliases Cairo so existing design-token consumers do not resolve to a missing CSS variable.
- Keep IBM Plex Mono for price/technical labels but set `preload: false`, so it does not compete with the Arabic text font and first-screen imagery during initial navigation.
- Align the homepage carousel skeleton with the exact responsive aspect-ratio token used by the real carousel, reducing a mobile/tablet geometry mismatch during fallback transitions.
- Remove image priority from the recent-ad rail, which is below the first screen and should remain lazy-loaded. Keep priority on the first visible featured slide and the first image in detail galleries.
- Correct the responsive `sizes` hints for the fixed-width product-list thumbnail, followed-store grid covers, compact store rows, store-detail cover and capped homepage carousel.
- Avoid reading browser data-saver/network policy and scheduling an image state update for SafeImage instances that do not have a blur preview.
- Preserve `prefetch={false}` on dense marketplace card links to avoid background route requests for every visible result card.
- Route audited `prefetch={false}` links through `components/navigation/IntentPrefetchLink.tsx`: no viewport prefetch is sent on page load, but the default Next.js prefetch policy is enabled after pointer hover or keyboard focus. Links opening another browsing context and download/hash/scheme links remain non-prefetching.

## Next.js 15 compatibility

This project is pinned to Next.js 15.5.x. The image code intentionally retains the Next.js 15 `priority` prop for true above-the-fold/LCP images. Do not switch to the Next.js 16 `preload` prop unless the framework is upgraded. Dynamic route prefetch remains disabled on dense card grids until the user shows intent; the shared Link adapter enables default prefetch after hover or focus rather than on initial viewport entry.

## Verification

Run:

```bash
npm run perf:phase5-audit
npm run rsc:phase4-audit
npm run hydration:browse-phase1-audit
npm run server:cache-phase2-audit
npm run detail:dedup-phase3-audit
npm run type-check
npm run build
```

The repository snapshot used for this stage does not contain `node_modules`; static audits can run, but TypeScript, production build, Lighthouse and real-device Core Web Vitals cannot be claimed as completed until dependencies are installed and the production site is tested.

## Expected impact (not a measured result)

- One unused Arabic font removed from the root font setup.
- The mono font is no longer preloaded on every route.
- Below-the-fold recent-ad images no longer request high priority.
- Several images select a closer `srcset` candidate based on their actual rendered width.
- The home carousel fallback reserves the same ratio as its final content.
- SafeImage no longer performs a browser-policy lookup for the common no-blur case.

No percentage improvement or LCP/CLS score is claimed without a production build and browser trace.
