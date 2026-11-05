import type { Metadata }       from 'next';
import dynamic                 from 'next/dynamic';
import { cache }               from 'react';
import Link                    from 'next/link';
import { UserX }  from 'lucide-react';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import { ProfileTabsSection }  from '@/components/profile/ProfileTabsSection';
import { EmptyState }          from '@/components/shared/feedback/EmptyState';
import { buildMetadata }       from '@/lib/seo';
import { usersApi }            from '@/api/users.api';
import { ROUTES }              from '@/lib/constants';
import type { PublicUser }     from '@/types/user.types';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
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
 * generateMetadata and the page component both called
 * usersApi.getById(id) independently — two real network requests per
 * page visit for the same data. React's cache() memoizes by argument
 * within a single render pass (request-scoped, not a global/shared
 * cache across users or requests), so the second call here resolves
 * from the first call's already-settled promise instead of firing
 * again. Same to ads/[id]/page.tsx's getCachedAd.
 */
const getCachedUser = cache((id: string) => usersApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await getCachedUser(id);
    const user = res.data.data;
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
    const res = await getCachedUser(id);
    user = res.data.data ?? null;
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

  // UX-FIX (audit P2-06): was bare centered text with no icon and, more
  // importantly, no way back into the app — every other not-found state
  // in the app (AdDetailSection, CategoryHero, SearchResults) uses
  // EmptyState with a recovery action; this was the one dead end.
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={<UserX className="h-10 w-10" />}
          title="المستخدم غير موجود"
          description="ربما تم حذف هذا الحساب أو أن الرابط غير صحيح"
          action={
            <Link href={ROUTES.home} className="text-sm text-primary hover:underline">
              العودة للرئيسية
            </Link>
          }
        />
      </div>
    );
  }

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
