'use client';

import Link from 'next/link';

import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Calendar, FileText, Star, UserPlus, UserMinus } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { getAvatarUrl }   from '@/lib/cloudinary';
import { formatDate }     from '@/lib/formatters';
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

/**
 * REDESIGN: matches the same mock StoreHeader.tsx was rebuilt against —
 * centered avatar, name, a stats card, centered bio. A plain user has no
 * cover photo or follow relationship the way a store does, so those
 * pieces of the mock are simply omitted here rather than faked; the
 * stats card uses what a profile actually has (ad count / city /
 * member-since) in place of store's (followers/products/city).
 *
 * UNIFIED-PROFILE: this is now the single entry point for a person
 * regardless of whether they're also a seller/store-owner/service-
 * provider (see /profile/[id]/page.tsx's ProfileTabsSection for the
 * per-role tab content) — the header itself only surfaces the verified
 * badge + aggregate rating a seller profile carries, since a store's
 * own name/logo/cover and a service provider's own business name stay
 * inside their respective tabs rather than replacing this header's
 * identity (this is the *person's* name, not the store's).
 */
export function PublicProfileHeader({ user }: Props) {
  const avatar = getAvatarUrl(user.avatarUrl ?? '', 128);
  const seller = user.sellerProfile;
  const rating = seller ? parseFloat(seller.averageRating) : 0;
  const isOnline = useIsUserOnline(user.id);
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const isOwnProfile = currentUserId === user.id;
  const { data: isFollowing = false } = useFollowStatus('USER', user.id);
  const toggleFollow = useToggleFollow();
  const { data: profileStories = [] } = useUserStories(user.id);
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);



  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="relative isolate overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-28 bg-gradient-to-l from-primary/15 via-violet-500/10 to-cyan-500/15" />
      <div className="relative z-10 pb-5 pt-7 sm:pb-8 sm:pt-9">
      <div className="relative z-10 flex flex-col items-center px-3 text-center sm:px-6">
        <div className={`relative shrink-0 rounded-full p-[3px] ${profileStories.length ? 'bg-gradient-to-tr from-amber-500 via-pink-500 to-violet-600' : 'bg-transparent'}`}>
          <button
            type="button"
            disabled={profileStories.length === 0}
            onClick={() => profileStories.length > 0 && setActiveStoryGroup({ user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null }, stories: profileStories, hasUnseen: profileStories.some((story) => !story.viewed), latestCreatedAt: profileStories[profileStories.length - 1]?.createdAt ?? user.createdAt })}
            className="relative block h-[5.5rem] w-[5.5rem] overflow-hidden rounded-full border-[3px] border-background bg-muted shadow-md sm:h-24 sm:w-24"
            aria-label={profileStories.length ? 'مشاهدة قصص المستخدم' : undefined}
          >
            <SafeImage variant="avatar" src={avatar} alt={user.name} fill className="object-cover" sizes="96px" />
          </button>
          {seller?.verified && (
            <div className="absolute -bottom-0.5 -end-0.5 z-10">
              <VerifiedBadge />
            </div>
          )}
          {isOnline && (
            <span
              className="absolute bottom-0.5 end-0.5 z-10 h-3.5 w-3.5 rounded-full bg-online ring-2 ring-background"
              aria-label="متصل الآن"
              title="متصل الآن"
            />
          )}
        </div>

        <h1 className="mt-3.5 text-lg font-bold text-foreground sm:text-xl">{user.name}</h1>

        <ProfileBadges sellerProfile={seller} className="mt-2" />

        {seller && seller.totalRatings > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <Star className="h-4 w-4 fill-rating text-rating" />
            {rating.toFixed(1)} ({seller.totalRatings} تقييم)
          </span>
        )}

        {/* Stats card */}
        <div className="mt-5 w-full max-w-3xl rounded-2xl border border-border/70 bg-background/90 p-3 shadow-sm sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-xl bg-muted/55 px-2 py-3">
              <FileText className="mb-1 h-4 w-4 text-primary" />
              <span className="text-lg font-bold tabular-nums text-foreground">{user._count.ads}</span>
              <span className="text-xs text-muted-foreground">إعلان</span>
            </div>
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-xl bg-muted/55 px-2 py-3">
              <span className="text-lg font-bold tabular-nums text-foreground">{user.followStats.followers}</span>
              <span className="text-xs text-muted-foreground">متابع</span>
            </div>
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-xl bg-muted/55 px-2 py-3">
              <span className="text-lg font-bold tabular-nums text-foreground">{user.followStats.following}</span>
              <span className="text-xs text-muted-foreground">أتابعهم</span>
            </div>
            {user.city && (
              <>
                    <div className="flex min-h-[76px] flex-col items-center justify-center rounded-xl bg-muted/55 px-2 py-3">
                  <MapPin className="mb-1 h-4 w-4 text-primary" />
                  <span className="max-w-full truncate text-xs text-muted-foreground">{user.city}</span>
                </div>
              </>
            )}
            <div className="flex min-h-[76px] flex-col items-center justify-center rounded-xl bg-muted/55 px-2 py-3">
              <Calendar className="mb-1 h-4 w-4 text-primary" />
              <span className="max-w-full text-center text-xs leading-4 text-muted-foreground">عضو منذ {formatDate(user.createdAt)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs font-medium text-primary">
            <Link href={`/profile/${user.id}/followers`} className="hover:text-foreground hover:underline">المتابعون</Link>
            <Link href={`/profile/${user.id}/following`} className="hover:text-foreground hover:underline">أتابعهم</Link>
          </div>
        </div>

        {user.bio && (
          <p className="mt-5 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">{user.bio}</p>
        )}

        {/* FEAT-REPORT-USER-STORE / FEAT-BLOCK-FROM-PROFILE: message,
            block, and report gate themselves on the viewer (via
            useAuthStore) — only show on someone else's profile; edit
            only shows on your own. */}
        <div className="mt-5 w-full max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {!isOwnProfile && (
              <button
                type="button"
                disabled={toggleFollow.isPending}
                onClick={() => toggleFollow.mutate({ targetType: 'USER', targetId: user.id })}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
              >
                {isFollowing ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
              </button>
            )}
            <MessageUserButtonGate targetUserId={user.id} />
            <ShareAdButton
              title={user.name}
              url={`${APP_URL}${ROUTES.userProfile(user.id)}`}
              variant="button"
            />
            <EditProfileButtonGate targetUserId={user.id} />
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <BlockUserButtonGate targetUserId={user.id} targetUserName={user.name} />
            <ReportUserButtonGate targetUserId={user.id} />
          </div>
        </div>

        {activeStoryGroup && <StoryViewer group={activeStoryGroup} onClose={() => setActiveStoryGroup(null)} />}

      </div>
      </div>
      </section>
    </div>
  );
}
