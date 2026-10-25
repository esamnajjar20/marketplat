import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { buildMetadata } from '@/lib/seo';
import { requestsApi } from '@/api/requests.api';
import type { RequestDetail } from '@/types/request.types';
import { buildRequestJsonLd, safeJsonLd } from '@/lib/structuredData';

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

// this layout fetches the request twice per
// page load — once in generateMetadata, once in the default export — and
// unlike stores/[id]/page.tsx and services/[id]/page.tsx (both of which
// already wrap their fetcher in cache()), this layout had no dedup. On
// Render Free (Frankfurt) from Gaza that means one extra round-trip per
// detail-page visit. Wrapping in React.cache() dedups within a single
// request's render tree, which is exactly the scope generateMetadata +
// default export share.
const getCachedRequest = cache((id: string) => requestsApi.getById(id));

/**
 * SW-SEO-JSONLD-REQUEST-01: this layout used to export a static
 * `metadata` (SW-SEO-REQUEST-DETAIL-01). It now also fetches the
 * request server-side so the JSON-LD script can be emitted.
 *
 * Why a layout and not the page: app/(public)/requests/[id]/page.tsx
 * is 'use client' (useParams + useAuthStore + mutation hooks), and
 * Next.js forbids server-side fetch, headers(), or `export const
 * metadata` from a client module. The layout is a server component
 * — it can do all three — and it wraps exactly one route segment,
 * so the fetch only runs for /requests/[id].
 *
 * Why the fetch is safe here: requests.routes.ts's GET /:id is
 * guarded by optionalAuthenticate, not requireAuth. Googlebot and
 * anonymous crawlers reach it without cookies; the endpoint returns
 * the same public shape either way (offers array is only populated
 * when authenticated, but its absence doesn't change the top-level
 * request fields). A 404 or failure here falls through to metadata
 * title 'تفاصيل الطلب' with no script — the page's own client-side
 * error UI still renders.
 *
 * Why the customer name is not in the JSON-LD: buildRequestJsonLd's
 * own doc comment covers this — a scrapable name-to-request mapping
 * is a weaker privacy default than keeping the request anonymous.
 * The page still shows the name to human readers.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await getCachedRequest(id);
    const request = res.data.data;
    if (!request) return buildMetadata({
      title: 'تفاصيل الطلب',
      path: `/requests/${id}`,
    });
    return buildMetadata({
      title: `${request.title} — طلب على سوق غزة`,
      description: request.description?.slice(0, 160) || undefined,
      path: `/requests/${id}`,
    });
  } catch {
    return buildMetadata({
      title: 'تفاصيل الطلب',
      path: `/requests/${id}`,
    });
  }
}

export default async function RequestDetailLayout({ children, params }: Props) {
  const { id } = await params;
  let request: RequestDetail | null = null;
  try {
    const res = await getCachedRequest(id);
    request = res.data.data ?? null;
  } catch {
    /* 404 — the page body renders its own empty state */
  }
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <>
      {request && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(
              buildRequestJsonLd({
                id: request.id,
                title: request.title,
                description: request.description,
                city: request.city,
                type: request.type,
                status: request.status,
                budgetMin: request.budgetMin,
                budgetMax: request.budgetMax,
                createdAt: request.createdAt,
                expiresAt: request.expiresAt,
              }),
            ),
          }}
        />
      )}
      {children}
    </>
  );
}
