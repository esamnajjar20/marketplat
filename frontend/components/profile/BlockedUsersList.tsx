'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMyBlockedUsers } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';

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
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المستخدمين المحظورين</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const list = data?.items ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        title="لا يوجد مستخدمون محظورون"
        description="عند حظر مستخدم من إحدى المحادثات، سيظهر هنا"
      />
    );
  }

  return (
    <div className="space-y-3">
      {list.map((row) => {
        const avatar = getAvatarUrl(row.blocked.avatarUrl ?? '', 40);
        return (
          <div key={row.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0">
                <Image src={avatar} alt={row.blocked.name} fill className="object-cover" sizes="36px" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium line-clamp-1">{row.blocked.name}</p>
                <p className="text-xs text-muted-foreground">محظور منذ {formatDate(row.createdAt)}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              disabled={pendingUserId === row.blockedId}
              onClick={() => handleUnblock(row.blockedId)}
            >
              {pendingUserId === row.blockedId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'إلغاء الحظر'
              )}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
