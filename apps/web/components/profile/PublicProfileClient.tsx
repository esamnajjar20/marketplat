'use client';

/** FIX SSR-FALLBACK-02: client-side profile render when the SSR fetch failed. */
import Link from 'next/link';
import { BadgeCheck, UserX, AlertTriangle } from 'lucide-react';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import {
  PublicProfileAvatar,
  PublicProfileFollowAction,
  PublicProfileHeaderTopActions,
  PublicProfileMessageActions,
} from '@/components/profile/PublicProfileInteractive';
import { useUser } from '@/hooks/queries/useUsers';
import { ProfileTabsSection } from '@/components/profile/ProfileTabsSection';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES } from '@/lib/constants';
import type { PublicUser } from '@/types/user.types';

function ClientProfileFallbackHeader({ user }: { user: PublicUser }) {
  const seller = user.sellerProfile;
  const memberYear = new Date(user.createdAt).getFullYear();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-background p-5 pt-16 shadow-sm">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-primary-soft to-accent-soft" />
      <PublicProfileHeaderTopActions user={user} />
      <div className="relative flex flex-col items-center gap-2 text-center">
        <PublicProfileAvatar user={user} />
        <h1 className="text-xl font-extrabold">{user.name}</h1>
        {seller?.verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary-strong">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> بائع موثّق
          </span>
        )}
        <p className="text-xs text-muted-foreground">عضو منذ {memberYear}</p>
        <ProfileBadges sellerProfile={seller} />
        {user.city && <p className="text-sm text-muted-foreground">{user.city}</p>}
        {user.bio && <p className="max-w-prose text-sm leading-relaxed text-foreground/75">{user.bio}</p>}
        <div className="flex w-full gap-2">
          <Link href={ROUTES.userFollowers(user.id)} className="flex-1 rounded-xl bg-surface-2 p-2 text-sm">
            {user.followStats.followers} متابع
          </Link>
          <Link href={ROUTES.userFollowing(user.id)} className="flex-1 rounded-xl bg-surface-2 p-2 text-sm">
            {user.followStats.following} أتابعهم
          </Link>
        </div>
        <div className="flex w-full gap-2">
          <PublicProfileFollowAction user={user} />
          <PublicProfileMessageActions user={user} />
        </div>
      </div>
    </section>
  );
}

export function PublicProfileClient({ id }: { id: string }) {
  const { data: user, isLoading, isError, error, refetch } = useUser(id);

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  if (isError || !user) {
    const notFound = isError && parseApiError(error).statusCode === 404;
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={notFound ? <UserX className="h-10 w-10" /> : <AlertTriangle className="h-10 w-10" />}
          title={notFound ? 'المستخدم غير موجود' : 'تعذّر تحميل الملف الشخصي'}
          description={notFound ? 'ربما تم حذف هذا الحساب أو أن الرابط غير صحيح' : 'حدثت مشكلة في الاتصال، حاول مرة أخرى'}
          action={notFound
            ? <Link href={ROUTES.home} className="text-sm text-primary hover:underline">العودة للرئيسية</Link>
            : <Button type="button" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto w-full max-w-5xl space-y-6 px-3 py-6 sm:px-4 lg:py-8">
      <ClientProfileFallbackHeader user={user} />
      <ProfileTabsSection user={user} />
    </div>
  );
}
