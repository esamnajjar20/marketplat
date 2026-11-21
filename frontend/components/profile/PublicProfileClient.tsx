'use client';

/** FIX SSR-FALLBACK-02: client-side profile render when the SSR fetch failed. */
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
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
import {
  ENTITY_PAGE,
  ENTITY_SHELL,
  ENTITY_BAND,
  ENTITY_BODY,
  ENTITY_STATS,
  ENTITY_STAT_TILE,
  ENTITY_STAT_VALUE,
  ENTITY_STAT_LABEL,
  ENTITY_ACTIONS_PRIMARY,
} from '@/components/shared/entity-page/entityPageTokens';
import type { PublicUser } from '@/types/user.types';

function ClientProfileFallbackHeader({ user }: { user: PublicUser }) {
  const seller = user.sellerProfile;
  const memberYear = new Date(user.createdAt).getFullYear();

  return (
    <section className={ENTITY_SHELL}>
      <div aria-hidden="true" className={ENTITY_BAND} />
      <PublicProfileHeaderTopActions user={user} />
      <div className={`${ENTITY_BODY} pt-14`}>
        <div className="flex flex-col items-center gap-2.5 text-center">
          <PublicProfileAvatar user={user} />
          <h1 className="text-xl font-extrabold tracking-tight sm:text-[22px]">{user.name}</h1>
          {seller?.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> بائع موثّق
            </span>
          )}
          <p className="text-xs text-muted-foreground">عضو منذ {memberYear}</p>
          <ProfileBadges sellerProfile={seller} />
          {user.city && <p className="text-sm text-muted-foreground">{user.city}</p>}
          {user.bio && <p className="max-w-prose text-sm leading-relaxed text-foreground/75">{user.bio}</p>}
          <div className={`${ENTITY_STATS} mt-1 w-full max-w-md`}>
            <IntentPrefetchLink href={ROUTES.userFollowers(user.id)} className={ENTITY_STAT_TILE} prefetch={false}>
              <span className={ENTITY_STAT_VALUE}>{user.followStats.followers}</span>
              <span className={ENTITY_STAT_LABEL}>متابع</span>
            </IntentPrefetchLink>
            <IntentPrefetchLink href={ROUTES.userFollowing(user.id)} className={ENTITY_STAT_TILE} prefetch={false}>
              <span className={ENTITY_STAT_VALUE}>{user.followStats.following}</span>
              <span className={ENTITY_STAT_LABEL}>أتابعهم</span>
            </IntentPrefetchLink>
            <div className={ENTITY_STAT_TILE}>
              <span className={ENTITY_STAT_VALUE}>{user._count.ads}</span>
              <span className={ENTITY_STAT_LABEL}>إعلان</span>
            </div>
          </div>
          <div className={`${ENTITY_ACTIONS_PRIMARY} w-full max-w-md`}>
            <PublicProfileFollowAction user={user} />
            <PublicProfileMessageActions user={user} />
          </div>
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
      <div className={ENTITY_PAGE}>
        <EmptyState
          icon={notFound ? <UserX className="h-10 w-10" /> : <AlertTriangle className="h-10 w-10" />}
          title={notFound ? 'المستخدم غير موجود' : 'تعذّر تحميل الملف الشخصي'}
          description={notFound ? 'ربما تم حذف هذا الحساب أو أن الرابط غير صحيح' : 'حدثت مشكلة في الاتصال، حاول مرة أخرى'}
          action={notFound
            ? <IntentPrefetchLink href={ROUTES.home} className="text-sm text-primary hover:underline" prefetch={false}>العودة للرئيسية</IntentPrefetchLink>
            : <Button type="button" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>}
        />
      </div>
    );
  }

  return (
    <div className={ENTITY_PAGE}>
      <ClientProfileFallbackHeader user={user} />
      <ProfileTabsSection user={user} />
    </div>
  );
}
