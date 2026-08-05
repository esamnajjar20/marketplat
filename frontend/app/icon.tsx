import { ImageResponse } from 'next/og';

/**
 * FIX سISSING-ASSETS-01: the app had no favicon at all — public/ was
 * empty (just .gitkeep) and app/ had no icon.tsx/icon.png, so every
 * browser tab showed a blank/default icon. This is Next.js's
 * file-convention route for generating a favicon at build time rather
 * than requiring a designed .ico/.png asset — a simple rendering of
 * the same mark used in components/layout/Logo.tsx (the "س" glyph on
 * the brand olive), so the tab icon is at least consistent with the
 * in-app wordmark rather than being blank.
 *
 * This is a reasonable stand-in, not a replacement for a proper
 * designed icon set (apple-touch-icon, PWA manifest icons at multiple
 * sizes, etc.) — see the note in app/manifest.ts.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 20,
          fontWeight: 700,
          borderRadius: 6,
        }}
      >
        س
      </div>
    ),
    { ...size },
  );
}
