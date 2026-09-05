'use client';

/**
 * Pending store-team invitations for the current user.
 * Can be shown on /my-store/members or a dedicated notifications area.
 */

import { Building2, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyMemberInvites } from '@/hooks/queries/useStoreMembers';
import { useAcceptStoreMemberInvite } from '@/hooks/mutations/useStoreMemberMutations';
import type { StoreMember, StoreMemberRole } from '@/types/store-member.types';

const ROLE_LABELS: Record<StoreMemberRole, string> = {
  MANAGER: 'مدير',
  STAFF: 'موظف',
  EDITOR: 'محرر منتجات',
};

function InviteCard({ invite }: { invite: StoreMember }) {
  const accept = useAcceptStoreMemberInvite();
  const storeName = invite.store?.name ?? 'متجر';
  const logo = invite.store?.logoUrl;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted overflow-hidden">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-10 w-10 object-cover" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium truncate">{storeName}</p>
        <p className="text-xs text-muted-foreground">
          دعوتك كـ <Badge variant="secondary">{ROLE_LABELS[invite.role]}</Badge>
          {invite.invitedBy?.name ? ` من ${invite.invitedBy.name}` : ''}
        </p>
      </div>
      <Button
        size="sm"
        className="gap-1.5"
        disabled={accept.isPending}
        onClick={() => accept.mutate(invite.id)}
      >
        {accept.isPending ? (
          <LoadingSpinner className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        قبول
      </Button>
    </div>
  );
}

export function MyMemberInvites() {
  const { data: invites, isLoading, isError, refetch } = useMyMemberInvites();

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <p className="text-muted-foreground">تعذّر تحميل الدعوات</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const list = Array.isArray(invites) ? invites : [];

  if (list.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-sm">دعوات للانضمام لفريق متجر</h2>
      <div className="space-y-2">
        {list.map((inv) => (
          <InviteCard key={inv.id} invite={inv} />
        ))}
      </div>
    </section>
  );
}
