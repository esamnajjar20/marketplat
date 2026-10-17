'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { safeBack } from '@/lib/navigation';

import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Star, Plus, UserMinus, ChevronRight, ChevronLeft, BadgeCheck } from 'lucide-react';
import { getAvatarUrl }   from '@/lib/cloudinary';
import { useIsUserOnline } from '@/hooks/queries/usePresence';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { EditProfileButtonGate } from '@/components/profile/EditProfileButtonGate';
import { BlockUserButtonGate } from '@/components/profile/BlockUserButtonGate';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import { useState } from 'react';
import type { PublicUser } from '@/types/user.types';
import { APP_URL, ROUTES } from '@/lib/constants';
import { useToggleFollow } from '@/hooks/mutations/useFollowMutations';
import { useFollowStatus } from '@/hooks/queries/useFollows';
import { useUserStories } from '@/hooks/queries/useStories';
import { StoryViewer } from '@/components/stories/StoryViewer';
import type { StoryGroup } from '@/api/stories.api';
import { useAuthStore } from '@/store/auth.store';

interface Props { user: PublicUser; }

const CIRCLE_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-foreground shadow-md backdrop-blur hover:bg-white';

/**
 * REDESIGN v2 — matches the approved "الملف الشخصي" mockup 1:1 on mobile:
 * soft band with back/share circles, gradient-ringed 92px avatar, name,
 * verified + member-since tags (plus the existing role badges), rating,
 * city, bio, 3-tile stats card (followers/following tiles link to their
 * lists), [follow | message] row, and a "متجره" row card. Desktop (lg+)
 * splits into identity (start) and stats/actions (end). Behavior and data
 * are unchanged (stories, presence, follow, block, report, edit).
 */
export function PublicProfileHeader({ user }: Props) {
  const router = useRouter();
  const avatar = getAvatarUrl(user.avatarUrl ?? '', 128);
  const seller = user.sellerProfile;
  const store = seller?.storeDetails ?? null;
  const rating = seller ? parseFloat(seller.averageRating) : 0;
  const isOnline = useIsUserOnline(user.id);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const isOwnProfile = currentUserId === user.id;
  const { data: isFollowing = false } = useFollowStatus('USER', user.id);
  const toggleFollow = useToggleFollow();
  const { data: profileStories = [] } = useUserStories(user.id);
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);
  const memberYear = new Date(user.createdAt).getFullYear();

  const stats = [
    { value: user._count.ads, label: 'إعلان', href: null as string | null },
    { value: user.followStats.followers, label: 'متابع', href: `/profile/${user.id}/followers` },
    { value: user.followStats.following, label: 'أتابعهم', href: `/profile/${user.id}/following` },
  ];
  const tileCls = 'flex flex-1 flex-col items-center gap-0.5 rounded-[14px] bg-surface-2 px-1 py-3';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="relative isolate overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm">
        {/* الشريط العلوي */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[120px] rounded-b-[28px] bg-gradient-to-br from-primary-soft to-accent-soft" />
        <div className="absolute inset-x-3.5 top-3.5 z-20 flex items-center justify-between">
          <button type="button" onClick={() => safeBack(router as any)} aria-label="رجوع" className={CIRCLE_BTN}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <ShareAdButton title={user.name} url={`${APP_URL}${ROUTES.userProfile(user.id)}`} variant="icon" className={CIRCLE_BTN} />
        </div>

        <div className="relative z-10 pb-6 pt-[72px] lg:pb-8">
          <div className="flex flex-col items-center px-4 text-center lg:flex-row lg:items-start lg:gap-10 lg:px-10 lg:text-start">
            {/* الهوية */}
            <div className="flex w-full flex-col items-center lg:w-72 lg:shrink-0 lg:items-start">
              <div className="relative shrink-0 rounded-full bg-gradient-to-br from-rating via-accent to-primary p-[3px]">
                <button
                  type="button"
                  disabled={profileStories.length === 0}
                  onClick={() => profileStories.length > 0 && setActiveStoryGroup({ user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null }, stories: profileStories, hasUnseen: profileStories.some((story) => !story.viewed), latestCreatedAt: profileStories[profileStories.length - 1]?.createdAt ?? user.createdAt })}
                  className="relative block h-[92px] w-[92px] overflow-hidden rounded-full border-4 border-background bg-primary-soft lg:h-28 lg:w-28"
                  aria-label={profileStories.length ? 'مشاهدة قصص المستخدم' : undefined}
                >
                  <SafeImage variant="avatar" src={avatar} alt={user.name} fill className="object-cover" sizes="112px" />
                </button>
                {isOnline && (
                  <span
                    className="absolute bottom-1.5 start-1.5 z-10 h-[18px] w-[18px] rounded-full border-[3px] border-background bg-online"
                    aria-label="متصل الآن"
                    title="متصل الآن"
                  />
                )}
              </div>

              <h1 className="mt-2.5 text-[23px] font-extrabold leading-snug text-foreground">{user.name}</h1>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                {seller?.verified && (
                  <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-bold text-primary-strong">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> بائع موثّق
                  </span>
                )}
                <span className="inline-flex h-[26px] items-center rounded-full bg-surface-2 px-2.5 text-xs font-bold text-foreground/80">عضو منذ {memberYear}</span>
              </div>

              <ProfileBadges sellerProfile={seller} className="mt-2 lg:justify-start" />

              {seller && seller.totalRatings > 0 && (
                <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-bold text-foreground">
                  <Star className="h-[15px] w-[15px] fill-rating text-rating" />
                  {rating.toFixed(1)}
                  <span className="font-normal text-muted-foreground">({seller.totalRatings} تقييم)</span>
                </span>
              )}

              {user.city && (
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden />{user.city}
                </span>
              )}

              {user.bio && (
                <p className="mx-2 mt-2.5 max-w-sm text-sm leading-[1.8] text-foreground/75 lg:mx-0">{user.bio}</p>
              )}
            </div>

            {/* الإحصائيات والأزرار */}
            <div className="flex w-full min-w-0 flex-1 flex-col items-stretch lg:pt-14">
              <div className="mt-4 flex gap-2 rounded-[20px] border border-border bg-card p-2.5 shadow-sm lg:mt-0">
                {stats.map((t) => {
                  const inner = (
                    <>
                      <span className="text-[19px] font-extrabold leading-tight tabular-nums text-foreground">{t.value}</span>
                      <span className="text-xs text-muted-foreground">{t.label}</span>
                    </>
                  );
                  return t.href ? (
                    <Link key={t.label} href={t.href} className={`${tileCls} transition hover:bg-primary-soft`}>{inner}</Link>
                  ) : (
                    <div key={t.label} className={tileCls}>{inner}</div>
                  );
                })}
              </div>

              <div className="mt-3.5 flex flex-wrap gap-2">
                {!isOwnProfile && (
                  <button
                    type="button"
                    disabled={toggleFollow.isPending}
                    onClick={() => toggleFollow.mutate({ targetType: 'USER', targetId: user.id })}
                    className={`flex h-[46px] flex-[1.4] items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold transition active:scale-[0.98] disabled:opacity-60 ${isFollowing ? 'border-[1.5px] border-primary/25 bg-card text-primary-strong hover:bg-primary-soft' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                  >
                    {isFollowing ? <UserMinus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                    {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
                  </button>
                )}
                <MessageUserButtonGate
                  targetUserId={user.id}
                  size="default"
                  variant="outline"
                  className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-primary/25 bg-card text-[15px] font-bold text-primary-strong hover:bg-primary-soft"
                />
                <EditProfileButtonGate targetUserId={user.id} />
              </div>

              {store && (
                <Link
                  href={ROUTES.storeDetail(store.id)}
                  className="mt-4 flex items-center gap-3 rounded-[20px] border border-border bg-card p-3 text-start shadow-sm transition hover:border-primary/30"
                >
                  <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-primary-soft">
                    <SafeImage variant="avatar" src={getAvatarUrl(store.logoUrl ?? '', 96)} alt={store.name} fill className="object-cover" sizes="52px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-primary">متجره</span>
                    <span className="block truncate text-[15px] font-extrabold text-foreground">{store.name}</span>
                    <span className="block text-xs text-muted-foreground">{store._count.products} منتج · {store._count.followers} متابع</span>
                  </span>
                  <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              )}

              <div className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground lg:justify-start">
                <BlockUserButtonGate targetUserId={user.id} targetUserName={user.name} />
                <ReportUserButtonGate targetUserId={user.id} />
              </div>
            </div>
          </div>

          {activeStoryGroup && <StoryViewer group={activeStoryGroup} onClose={() => setActiveStoryGroup(null)} />}
        </div>
      </section>
    </div>
  );
}
