import type { Metadata }       from 'next';
import dynamic                 from 'next/dynamic';
import { notFound }            from 'next/navigation';
import { cache }               from 'react';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import { ProfileTabsSection }  from '@/components/profile/ProfileTabsSection';
import { buildMetadata }       from '@/lib/seo';
import type { PublicUser }     from '@/types/user.types';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import type { AdListItem } from '@/types/ad.types';
import type { PaginationMeta } from '@/types/api.types';

const PublicProfileClient = dynamic(
  () =>
    import('@/components/profile/PublicProfileClient').then(
      (module) => module.PublicProfileClient,
    ),
);

interface Props {
  params: Promise<{ id: string }> ;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined): number {
  const parsed = Number(value ?? 1);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

/**
 * Use the shared Server Component API reader for both metadata and page
 * data. React's cache() memoizes this identity-sensitive read per request,
 * while fetchServerApi routes through the Cloudflare API_WORKER binding in
 * production and applies the same response-envelope validation as other
 * server-rendered public pages.
 */
const getCachedUser = cache(async (id: string): Promise<PublicUser | null> => {
  const response = await fetchServerApi<PublicUser>(
    `/users/${encodeURIComponent(id)}`,
    { mode: 'no-store', timeoutMs: 3_000 },
  );
  return response.data ?? null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const user = await getCachedUser(id);
    return buildMetadata({ title: `${user?.name ?? ''} — الملف الشخصي`, path: `/profile/${id}` });
  } catch {
    return { title: 'الملف الشخصي' };
  }
}

export default async function PublicProfilePage({ params, searchParams }: Props) {
  const { id } = await params;
  const rawSearch = searchParams ? await searchParams : {};
  const requestedTab = first(rawSearch.tab);
  const requestedPage = positivePage(first(rawSearch.page));
  let user: PublicUser | null = null;
  let loadFailed = false;
  try {
    user = await getCachedUser(id);
  } catch (err) {
    // FIX SSR-RESILIENCE-02: only a confirmed 404 means "user not found".
    // Any other failure (network, 5xx, timeout) used to be swallowed here
    // and shown as a deleted account.
    const status =
      (err as { statusCode?: number })?.statusCode ??
      (err as { response?: { status?: number } })?.response?.status;
    if (status !== 404) loadFailed = true;
  }

  // FIX SSR-FALLBACK-02: SSR fetch failed (not a 404) -> let the browser fetch it.
  if (!user && loadFailed) return <PublicProfileClient id={id} />;

  // Confirmed 404 only: render the (public) group 404 with noindex instead of a 200 soft 404.
  if (!user) notFound();

  const seller = user.sellerProfile;
  const hasStore = Boolean(seller?.storeDetails);
  const hasServices = Boolean(seller?.serviceProviderDetails);
  const hasRatings = Boolean(seller && (seller.totalRatings > 0 || seller._count.serviceReviews > 0));
  const sectionCount = [true, hasStore, hasServices, hasRatings].filter(Boolean).length;
  const defaultTab = sectionCount > 1 ? 'overview' : 'ads';
  const allowedTabs = new Set(['overview', 'ads', 'store', 'services', 'ratings']);
  const selectedTab = requestedTab && allowedTabs.has(requestedTab) ? requestedTab : defaultTab;
  const queryClient = getQueryClient();

  // The overview tab currently renders the public ads grid. Seed only that
  // initial tab (including deep links to ?tab=ads), not every profile section.
  // This keeps tab code lazy while avoiding a client GET on the first view.
  if (selectedTab === 'overview' || selectedTab === 'ads') {
    const query = new URLSearchParams({ page: String(requestedPage) });
    try {
      const response = await fetchServerApi<AdListItem[]>(
        `/users/${encodeURIComponent(id)}/ads?${query.toString()}`,
        { mode: 'no-store', timeoutMs: 3_000 },
      );
      const pagination = response.meta?.pagination as PaginationMeta | undefined;
      if (Array.isArray(response.data) && pagination) {
        queryClient.setQueryData(queryKeys.users.ads(id, { page: requestedPage }), {
          items: response.data,
          meta: pagination,
        });
      }
    } catch {
      // PublicProfileAds keeps its existing client-fetch/error fallback.
    }
  }

  return (
    <div className="container mx-auto w-full max-w-6xl space-y-6 px-3 py-5 sm:px-5 sm:py-7 lg:py-9">
      <PublicProfileHeader user={user} />
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProfileTabsSection user={user} />
      </HydrationBoundary>
    </div>
  );
}
