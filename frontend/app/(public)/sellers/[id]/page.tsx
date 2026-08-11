import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { SellerProfileHeader } from '@/components/sellers/SellerProfileHeader';
import { SellerProfileAds } from '@/components/sellers/SellerProfileAds';
import { SellerRatingsList } from '@/components/sellers/SellerRatingsList';
import { ServiceReviewsList } from '@/components/services/ServiceReviewsList';
import { ErrorBoundary } from '@/components/shared/feedback/ErrorBoundary';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { buildMetadata } from '@/lib/seo';
import { sellersApi } from '@/api/sellers.api';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

// Same reasoning as PublicProfilePage's getCachedUser (see
// app/(public)/profile/[id]/page.tsx): memoizes within a single render
// pass so generateMetadata and the page body don't each fire their own
// network request for the same seller.
const getCachedSeller = cache((id: string) => sellersApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const seller = await getCachedSeller(id);
    return buildMetadata({
      title: `${seller.data.data!.displayName} — بائع`,
      path: `/sellers/${id}`,
    });
  } catch {
    return { title: 'ملف البائع' };
  }
}

export default async function SellerProfilePage({ params }: Props) {
  const { id } = await params;
  let seller: Awaited<ReturnType<typeof sellersApi.getById>>['data']['data'] | null = null;

  try {
    const res = await getCachedSeller(id);
    seller = res.data.data ?? null;
  } catch {
    /* seller 404 */
  }

  // P1 FIX (layout audit §3): was a bare centered line of muted text
  // with no icon and no way back — one of the three inconsistent
  // "not found" treatments the audit flagged. Now matches the
  // EmptyState pattern already used by /stores/[id] and /ads/[id].
  if (!seller) {
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="البائع غير موجود"
          description="ربما تم حذف هذا الملف الشخصي أو أن الرابط غير صحيح"
          action={
            <Link href={ROUTES.search} className="text-sm text-primary hover:underline">
              تصفح الإعلانات
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <SellerProfileHeader seller={seller} />
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">إعلانات البائع</h2>
        <SellerProfileAds ads={seller.ads} />
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">تقييمات الإعلانات</h2>
        {/* TRACK-AD-RATINGS-LIST: same render-time-throw isolation as
            the service reviews boundary directly below — a malformed
            rating row shouldn't blank the rest of this profile page. */}
        <ErrorBoundary
          fallback={
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
              تعذّر عرض تقييمات الإعلانات
            </div>
          }
        >
          <SellerRatingsList sellerProfileId={seller.id} />
        </ErrorBoundary>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">تقييمات الخدمات</h2>
        {/* AUDIT-FIX (issue #7.4): ServiceReviewsList's own isError branch
            only covers a failed fetch. An unexpected render-time throw
            (e.g. malformed review data) had nothing catching it here,
            so it would blank the rest of this profile page below the
            header. This boundary scopes that failure to the reviews
            section instead. */}
        <ErrorBoundary
          fallback={
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive">
              تعذّر عرض تقييمات الخدمات
            </div>
          }
        >
          <ServiceReviewsList sellerProfileId={seller.id} />
        </ErrorBoundary>
      </section>
    </div>
  );
}
