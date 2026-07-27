import type { Metadata }       from 'next';
import { Suspense, cache }     from 'react';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import { PublicProfileAds }    from '@/components/profile/PublicProfileAds';
import { LoadingSpinner }      from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata }       from '@/lib/seo';
import { usersApi }            from '@/api/users.api';

interface Props { params: Promise<{ id: string }> }

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
  let user: { name: string; city: string | null; bio: string | null; avatarUrl: string | null; createdAt: string; _count: { ads: number } } | null = null;
  try {
    const res = await getCachedUser(id);
    user = (res.data.data as typeof user) ?? null;
  } catch { /* user 404 */ }

  if (!user) {
    return <div className="text-center py-20 text-muted-foreground">المستخدم غير موجود</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <PublicProfileHeader user={{ id, ...user }} />
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">إعلانات المستخدم</h2>
        <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
          <PublicProfileAds userId={id} />
        </Suspense>
      </section>
    </div>
  );
}
