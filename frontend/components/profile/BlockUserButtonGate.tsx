'use client';

/**
 * FEAT-BLOCK-FROM-PROFILE: previously the only place to block a user was
 * ChatWindow's conversation-header dropdown — someone who wanted to block
 * a user they hadn't messaged yet (or no longer had an open thread with)
 * had no path to do it. Reuses the exact same hooks ChatWindow already
 * uses (useIsUserBlocked / useToggleUserBlock), so this stays in sync
 * with any block/unblock done from a chat — same shared blockedUsers
 * cache Set, no separate state to drift.
 *
 * Same client-boundary shape as ReportUserButtonGate / MessageUserButtonGate
 * right next to it: PublicProfileHeader itself has no 'use client', so
 * the "is this my own profile" check (and the mutation) lives here.
 */
import { useState } from 'react';
import { UserX, UserCheck } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';

interface Props {
  targetUserId: string;
  targetUserName: string;
}

export function BlockUserButtonGate({ targetUserId, targetUserName }: Props) {
  const currentUser = useAuthStore(selectUser);
  const isBlocked = useIsUserBlocked(targetUserId);
  const { mutate: toggleBlock, isPending } = useToggleUserBlock();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Same guards as ReportUserButtonGate: signed out, or viewing your own
  // profile — blocking yourself is meaningless and the backend has no
  // such case to handle either.
  if (!currentUser || currentUser.id === targetUserId) return null;

  function handleClick() {
    // Unblocking needs no confirmation (reversible, low-stakes); only
    // blocking is confirmed first — same asymmetry as ChatWindow's
    // handleToggleBlock.
    if (isBlocked) {
      toggleBlock(targetUserId);
    } else {
      setConfirmOpen(true);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={isPending}
        onClick={handleClick}
      >
        {isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
        {isBlocked ? 'إلغاء الحظر' : 'حظر'}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`حظر ${targetUserName}؟`}
        description="لن يتمكن هذا المستخدم من مراسلتك، ولن تتمكن من مراسلته حتى تلغي الحظر."
        confirmLabel="حظر"
        destructive
        isPending={isPending}
        onConfirm={() =>
          toggleBlock(targetUserId, { onSuccess: () => setConfirmOpen(false) })
        }
      />
    </>
  );
}
