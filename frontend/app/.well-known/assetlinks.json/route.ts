import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Android Digital Asset Links. Configure SHA-256 fingerprints from every real signing key. */
export async function GET() {
  const fingerprints = (process.env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-F0-9]{2}(?::[A-F0-9]{2}){31}$/.test(value));

  if (fingerprints.length === 0) {
    return NextResponse.json(
      { error: 'Android App Links are not verified until ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS is configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.marketplat.mobile',
      sha256_cert_fingerprints: [...new Set(fingerprints)],
    },
  }], { headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' } });
}
