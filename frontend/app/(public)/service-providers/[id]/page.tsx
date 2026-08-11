import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { SearchX, Wrench } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { ServiceProviderHeader } from '@/components/services/ServiceProviderHeader';
import { ServiceProviderListings } from '@/components/services/ServiceProviderListings';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';

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

  // P1 FIX (layout audit §3): was a bare centered line of muted text
  // with no icon and no way back — one of the three inconsistent
  // "not found" treatments the audit flagged. Now matches the
  // EmptyState pattern already used by /stores/[id] and /ads/[id].
  if (!provider) {
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="مقدم الخدمة غير موجود"
          description="ربما تم حذف هذا الملف الشخصي أو أن الرابط غير صحيح"
          action={
            <Link href={ROUTES.serviceProviders} className="text-sm text-primary hover:underline">
              تصفح مقدمي الخدمات
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <ServiceProviderHeader provider={provider} />
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          الخدمات المتاحة
        </h2>
        <ServiceProviderListings provider={provider} listings={provider.listings} />
      </section>
    </div>
  );
}
