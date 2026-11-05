import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { buildMetadata } from '@/lib/seo';
import { requestsApi } from '@/api/requests.api';
import type { RequestDetail } from '@/types/request.types';
import { buildRequestJsonLd, safeJsonLd } from '@/lib/structuredData';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';

interface Props {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

// React.cache() shares the anonymous-safe request read between
// generateMetadata and this layout within the same render request. The
// result is then dehydrated for the client page, avoiding a second public
// GET for guests. Authenticated viewers still make one browser request
// because the backend intentionally returns a different, permission-scoped
// offers subset for each viewer.
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
  const queryClient = getQueryClient();
  if (request) {
    // SSR runs without the visitor's bearer token and therefore receives
    // only the privacy-safe public shape (offers: []). Authenticated clients
    // selectively refresh this query to obtain only their authorized offers.
    queryClient.setQueryData(queryKeys.requests.detail(id), request);
  }

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
      <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>
    </>
  );
}
