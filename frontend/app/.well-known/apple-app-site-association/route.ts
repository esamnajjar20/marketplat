import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Universal Links association; Apple Team ID is intentionally not guessed. */
export async function GET() {
  const teamId = (process.env.APPLE_TEAM_ID || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    return NextResponse.json(
      { error: 'Universal Links are not verified until APPLE_TEAM_ID is configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json({
    applinks: {
      apps: [],
      details: [{
        appID: `${teamId}.com.marketplat.mobile`,
        paths: ['/ads/*', '/products/*', '/stores/*', '/services/*', '/profile/*', '/shared'],
      }],
    },
  }, { headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' } });
}
