'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus, UserMinus } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getAvatarUrl } from '@/lib/cloudinary';
import { safeBack } from '@/lib/navigation';
import { APP_URL, ROUTES } from '@/lib/constants';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { EditProfileButtonGate } from '@/components/profile/EditProfileButtonGate';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { useIsUserOnline } from '@/hooks/queries/usePresence';
import { useUserStories } from '@/hooks/queries/useStories';
import { useToggleFollow } from '@/hooks/mutations/useFollowMutations';
import { useFollowStatus } from '@/hooks/queries/useFollows';
import { useAuthStore } from '@/store/auth.store';
import type { PublicUser } from '@/types/user.types';
import type { StoryGroup } from '@/api/stories.api';

const CIRCLE_BTN =
  'flex h-11 w-11 items-center justify-center rounded-full border-0 bg-white/90 p-0 text-foreground shadow-md backdrop-blur hover:bg-white';

export function PublicProfileHeaderTopActions({ user }: { user: PublicUser }) {
  const router = useRouter();

  return (
    <div className="absolute inset-x-3.5 top-3.5 z-20 flex items-center justify-between">
      <button
        type="button"
        onClick={() => safeBack(router)}
        aria-label="رجوع"
        className={CIRCLE_BTN}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
      <ShareAdButton
        title={user.name}
        url={`${APP_URL}${ROUTES.userProfile(user.id)}`}
        variant="icon"
        className={CIRCLE_BTN}
      />
    </div>
  );
}

export function PublicProfileAvatar({ user }: { user: PublicUser }) {
  const isOnline = useIsUserOnline(user.id);
  const { data: profileStories = [] } = useUserStories(user.id);
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);
  const avatar = getAvatarUrl(user.avatarUrl ?? '', 128);

  return (
    <>
      <div className="relative shrink-0 rounded-full bg-gradient-to-br from-rating via-accent to-primary p-[3px]">
        <button
          type="button"
          disabled={profileStories.length === 0}
          onClick={() =>
            profileStories.length > 0 &&
            setActiveStoryGroup({
              user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl ?? null },
              stories: profileStories,
              hasUnseen: profileStories.some((story) => !story.viewed),
              latestCreatedAt: profileStories[profileStories.length - 1]?.createdAt ?? user.createdAt,
            })
          }
          className="relative block h-[92px] w-[92px] overflow-hidden rounded-full border-4 border-background bg-primary-soft lg:h-28 lg:w-28"
          aria-label={profileStories.length ? 'مشاهدة قصص المستخدم' : undefined}
        >
          <SafeImage
            variant="avatar"
            src={avatar}
            alt={user.name}
            fill
            className="object-cover"
            sizes="112px"
          />
        </button>
        {isOnline && (
          <span
            className="absolute bottom-1.5 start-1.5 z-10 h-[18px] w-[18px] rounded-full border-[3px] border-background bg-online"
            aria-label="متصل الآن"
            title="متصل الآن"
          />
        )}
      </div>
      {activeStoryGroup && (
        <StoryViewer group={activeStoryGroup} onClose={() => setActiveStoryGroup(null)} />
      )}
    </>
  );
}

export function PublicProfileFollowAction({ user }: { user: PublicUser }) {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { data: isFollowing = false } = useFollowStatus('USER', user.id);
  const toggleFollow = useToggleFollow();

  if (currentUserId === user.id) return null;

  return (
    <button
      type="button"
      disabled={toggleFollow.isPending}
      onClick={() => toggleFollow.mutate({ targetType: 'USER', targetId: user.id })}
      className={`flex h-[46px] flex-[1.4] items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold transition active:scale-[0.98] disabled:opacity-60 ${isFollowing ? 'border-[1.5px] border-primary/25 bg-card text-primary-strong hover:bg-primary-soft' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
    >
      {isFollowing ? <UserMinus className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
      {isFollowing ? 'إلغاء المتابعة' : 'متابعة'}
    </button>
  );
}

export function PublicProfileMessageActions({ user }: { user: PublicUser }) {
  return (
    <>
      <MessageUserButtonGate
        targetUserId={user.id}
        size="default"
        variant="outline"
        className="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-primary/25 bg-card text-[15px] font-bold text-primary-strong hover:bg-primary-soft"
      />
      <EditProfileButtonGate targetUserId={user.id} />
    </>
  );
}
