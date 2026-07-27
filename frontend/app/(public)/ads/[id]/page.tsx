import type { Metadata }    from 'next';
import { notFound }         from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { AdDetailSection }  from '@/components/ads/AdDetailSection';
import { getQueryClient }   from '@/lib/queryClient';
import { prefetchAdDetail as prefetchAd } from '@/lib/prefetch';
import { buildAdMetadata }  from '@/lib/seo';

interface Props { params: Promise<{ id: string }> }

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
