import { ImageResponse } from 'next/og';

/**
 * FIX PROD-02: see app/icon-192/route.tsx for the full reasoning — same
 * mark, larger canvas (512x512 is the other size PWA install prompts
 * and app stores commonly request, alongside 192x192).
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
          fontSize: 290,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        س
      </div>
    ),
    { width: 512, height: 512 },
  );
}
