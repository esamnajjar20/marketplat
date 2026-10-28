'use client';

import { useFollowStatus } from '@/hooks/queries/useFollows';
import { useToggleFollow } from '@/hooks/mutations/useFollowMutations';
import { useAuthStore } from '@/store/auth.store';
import type { FollowTargetType } from '@/api/follows.api';
import { Spinner } from '@/components/ui/spinner';

export function FollowActionButton({
  targetType,
  targetId,
  userId,
}: {
  targetType: FollowTargetType;
  targetId: string;
  userId?: string;
}) {
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { data: following = false, isLoading: statusLoading } = useFollowStatus(targetType, targetId);
  const toggle = useToggleFollow();

  if (userId && currentUserId === userId) return null;

  return (
    <button
      type="button"
      disabled={statusLoading || toggle.isPending}
      aria-pressed={following}
      onClick={() => toggle.mutate({ targetType, targetId })}
      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 sm:px-4 ${following ? 'border-border bg-muted/60 text-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive' : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'}`}
    >
      {(statusLoading || toggle.isPending) && <Spinner size="xs" />}
      {statusLoading ? 'جارٍ التحقق' : toggle.isPending ? 'جارٍ التحديث' : following ? 'تتابعه' : 'متابعة'}
    </button>
  );
}
