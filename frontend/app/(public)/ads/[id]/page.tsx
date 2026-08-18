import type { Metadata }    from 'next';
import { notFound }         from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { AdDetailSection }  from '@/components/ads/AdDetailSection';
import { getQueryClient }   from '@/lib/queryClient';
import { prefetchAdDetail as prefetchAd } from '@/lib/prefetch';
import { buildAdMetadata }  from '@/lib/seo';

interface Props { params: Promise<{ id: string }> }

// RENDER-FIX (dynamic-routes audit, item A/C): ads are paginated and
// effectively unbounded (ads.repository.ts findMany uses skip/take —
// no listing endpoint returns "all" ads), so generateStaticParams
// intentionally returns none here — prerendering every ad id at build
// time would mean an unbounded, ever-growing build-time fetch. Returning
// [] with dynamicParams left at its default (true) means: zero ads are
// prerendered at build time, but the first visit to any /ads/:id
// generates and caches that page on-demand, and subsequent visits reuse
// the cached result for `revalidate` seconds — real ISR, not
// per-request dynamic rendering. New ads are reachable immediately
// (first hit just costs one on-demand render).
export async function generateStaticParams() {
  return [];
}

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const qc = getQueryClient();
  try {
    await prefetchAd(qc, id);
    const ad = qc.getQueryData<{ title: string; description: string; images: string[]; price: string | null; city: string }>(['ads', 'detail', id]);
    if (!ad) return { title: 'الإعلان غير موجود' };
    return buildAdMetadata({ id, ...ad });
  } catch { return { title: 'الإعلان' }; }
}

export default async function AdDetailPage({ params }: Props) {
  const { id } = await params;
  const qc = getQueryClient();
  try { await prefetchAd(qc, id); } catch { notFound(); }

  return (
    <div className="container mx-auto px-4 py-6">
      <HydrationBoundary state={dehydrate(qc)}>
        <AdDetailSection id={id} />
      </HydrationBoundary>
    </div>
  );
}
