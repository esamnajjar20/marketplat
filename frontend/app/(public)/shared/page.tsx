import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SharedPayloadView } from '@/components/shared/SharedPayloadView';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'مشاركة بدون إنترنت',
  path: '/shared',
  noIndex: true,
});

/**
 * SHARE-QR-PAGE-01: receiver side of the QR share flow. The whole
 * payload arrives in the URL fragment (#d=...) — fragments never leave
 * the browser, so no data ends up in Cloudflare/Render logs and the
 * page works with no network on either side once warmed.
 *
 * Deliberately NOT a server component reading searchParams: that would
 * require the payload to be in the query string, which the server
 * would then log. Client-only reading of location.hash is the whole
 * point of this design.
 */
export default function SharedPayloadPage() {
  return (
    <div className="container mx-auto w-full max-w-3xl px-3 py-8 sm:px-4 lg:py-12">
      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">جارٍ الفتح…</div>}>
        <SharedPayloadView />
      </Suspense>
    </div>
  );
}
