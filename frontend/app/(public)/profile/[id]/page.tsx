import type { Metadata }       from 'next';
import { cache }               from 'react';
import Link                    from 'next/link';
import { UserX }               from 'lucide-react';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import { ProfileTabsSection }  from '@/components/profile/ProfileTabsSection';
import { EmptyState }          from '@/components/shared/feedback/EmptyState';
import { buildMetadata }       from '@/lib/seo';
import { usersApi }            from '@/api/users.api';
import { ROUTES }              from '@/lib/constants';
import type { PublicUser }     from '@/types/user.types';

interface Props { params: Promise<{ id: string }> }

// RENDER-FIX (dynamic-routes audit, item A/C): user count is unbounded
// (no "all users" listing endpoint), so no ids are prerendered at build
// time — dynamicParams stays at its default (true), first visit to any
// /profile/:id renders and caches on-demand, then serves from cache for
// `revalidate` seconds. This is PUBLIC profile data only (usersApi.getById
// — the same public-profile endpoint this page already called); no
// session/auth data is fetched here, so nothing private enters this
// shared route cache.
export async function generateStaticParams() {
  return [];
}

export const revalidate = 300;

/**
 * FIX PERF-11: generateMetadata and the page component both called
 * usersApi.getById(id) independently — two real network requests per
 * page visit for the same data. React's cache() memoizes by argument
 * within a single render pass (request-scoped, not a global/shared
 * cache across users or requests), so the second call here resolves
 * from the first call's already-settled promise instead of firing
 * again. Same fix applied to ads/[id]/page.tsx's getCachedAd.
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

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params;
  let user: PublicUser | null = null;
  try {
    const res = await getCachedUser(id);
    user = res.data.data ?? null;
  } catch { /* user 404 */ }

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

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <PublicProfileHeader user={user} />
      <ProfileTabsSection user={user} />
    </div>
  );
}
