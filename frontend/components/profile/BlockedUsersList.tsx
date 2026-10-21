'use client';

import { useState } from 'react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyBlockedUsers } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';

import { Spinner } from '@/components/ui/spinner';
/**
 * BlockedUsersList — /settings/blocked-users. Same structure as
 * ActiveSessionsList (per-row pending state so unblocking one user
 * doesn't disable every row's button — useToggleUserBlock is one
 * mutation instance shared across the list).
 */
export function BlockedUsersList() {
  const { data, isLoading, isError, refetch } = useMyBlockedUsers({ limit: 100 });
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const { mutate: toggleBlock } = useToggleUserBlock();

  function handleUnblock(userId: string) {
    setPendingUserId(userId);
    toggleBlock(userId, { onSettled: () => setPendingUserId(null) });
  }

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  if (isError) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-xs">
        <p className="font-bold text-destructive">حدث خطأ أثناء تحميل المستخدمين المحظورين</p>
        <Button type="button" variant="outline" size="sm" className="mt-4 rounded-xl font-bold" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const list = data?.items ?? [];

  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border/70 bg-card p-8 text-center shadow-xs">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <span className="text-lg" aria-hidden>⌀</span>
        </div>
        <p className="font-bold text-foreground">لا يوجد مستخدمون محظورون</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          عند حظر مستخدم من إحدى المحادثات، سيظهر هنا
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-2.5">
      <p className="text-sm text-muted-foreground">من حظرتهم لن يتمكنوا من مراسلتك.</p>
      {list.map((row) => {
        const avatar = getAvatarUrl(row.blocked.avatarUrl ?? '', 40);
        const initial = (row.blocked.name?.trim()?.[0] ?? '?').toUpperCase();
        return (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-xs"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-base font-extrabold text-primary">
                <SafeImage
                  variant="avatar"
                  src={avatar}
                  alt={row.blocked.name}
                  fill
                  className="object-cover"
                  sizes="44px"
                />
                <span className="sr-only">{initial}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold line-clamp-1">{row.blocked.name}</p>
                <p className="text-xs text-muted-foreground">محظور منذ {formatDate(row.createdAt)}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-xl font-bold text-primary"
              disabled={pendingUserId === row.blockedId}
              onClick={() => handleUnblock(row.blockedId)}
            >
              {pendingUserId === row.blockedId ? <Spinner size="sm" /> : 'إلغاء الحظر'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
