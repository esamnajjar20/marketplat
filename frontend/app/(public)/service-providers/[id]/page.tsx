import type { Metadata } from 'next';
import { cache } from 'react';
import { buildMetadata } from '@/lib/seo';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { ServiceProviderHeader } from '@/components/services/ServiceProviderHeader';
import { ServiceProviderListings } from '@/components/services/ServiceProviderListings';

interface Props {
  params: Promise<{ id: string }>;
}

// Same reasoning as sellers/[id]/page.tsx's getCachedSeller: memoizes
// within a single render pass so generateMetadata and the page body
// don't each fire their own network request for the same provider.
const getCachedProvider = cache((id: string) => serviceProvidersApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const provider = await getCachedProvider(id);
    return buildMetadata({
      title: `${provider.data.data!.businessName} — مقدم خدمة`,
      path: `/service-providers/${id}`,
    });
  } catch {
    return { title: 'مقدم خدمة' };
  }
}

export default async function ServiceProviderPage({ params }: Props) {
  const { id } = await params;
  let provider: Awaited<ReturnType<typeof serviceProvidersApi.getById>>['data']['data'] | null = null;

  try {
    const res = await getCachedProvider(id);
    provider = res.data.data ?? null;
  } catch {
    /* 404 */
  }

  if (!provider) {
    return <div className="text-center py-20 text-muted-foreground">مقدم الخدمة غير موجود</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <ServiceProviderHeader provider={provider} />
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">الخدمات المتاحة</h2>
        <ServiceProviderListings provider={provider} listings={provider.listings} />
      </section>
    </div>
  );
}
