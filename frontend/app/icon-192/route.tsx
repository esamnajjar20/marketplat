import { ImageResponse } from 'next/og';

// RENDER-FIX (dynamic-routes audit): this Route Handler has no request-
// dependent input (no cookies/headers/searchParams, no `request` arg
// even declared) — output is 100% deterministic. Route Handlers default
// to dynamic rendering unless told otherwise, which is why this showed
// up as "ƒ Dynamic" in `next build` despite never varying per request.
export const dynamic = 'force-static';

/**
 * FIX PROD-02: app/manifest.ts previously pointed only at the single
 * 32x32 app/icon.tsx (the browser-tab favicon), with an explicit note
 * that real 192x192/512x512 PWA icons still needed real designed
 * artwork. This is a route handler (not the icon.tsx file convention,
 * which only ever serves one fixed size at /icon) generating a larger
 * version of the same mark at the size Android/most install prompts
 * actually request — closing the gap between "manifest looks complete"
 * and "produces a legible home-screen icon" without waiting on a
 * dedicated design pass. Still not a substitute for a proper maskable
 * icon set — see the note in app/manifest.ts.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2F5D45',
          color: '#FDFBF7',
          fontSize: 110,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        س
      </div>
    ),
    { width: 192, height: 192 },
  );
}
