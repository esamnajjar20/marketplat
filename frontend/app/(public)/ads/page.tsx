import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';
import { AdsPageClient } from '@/components/ads/AdsPageClient';

// @418-FIX-v2: force-dynamic alone kept the Suspense fallbacks in the
// streamed HTML because useSearchParams() suspends during SSR. Removing
// the <Suspense> wrappers lets Next.js render the URL-sensitive parts
// as client-only (no server fallback), so there is no placeholder to
// mismatch on hydration. loading.tsx keeps the route-level shell UX.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({ title: 'الإعلانات', path: '/ads' });

export default function AdsPage() {
  return <AdsPageClient />;
}
