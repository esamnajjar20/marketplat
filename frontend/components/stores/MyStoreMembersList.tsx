'use client';

/**
 * Store team management — invite, change role, remove.
 * Mirrors MyPromotionsList structure (skeleton / error / empty / rows).
 */

import { useState } from 'react';
import {
  Users,
  UserPlus,
  AlertTriangle,
  Trash2,
  Mail,
  Shield,
  Check,
  Square,
  CheckSquare,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import { Input } from '@/components/shared/ui/Input';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AdListItemSkeleton } from '@/components/shared/skeletons/AdListItemSkeleton';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyStore } from '@/hooks/queries/useStores';
import { useStoreMembers } from '@/hooks/queries/useStoreMembers';
import {
  useInviteStoreMember,
  useUpdateStoreMemberRole,
  useRemoveStoreMember,
} from '@/hooks/mutations/useStoreMemberMutations';
import { BecomeStoreOwnerCard } from './BecomeStoreOwnerCard';
import type { ParsedError } from '@/lib/errorParser';
import type { StoreMember, StoreMemberRole } from '@/types/store-member.types';

const ROLE_LABELS: Record<StoreMemberRole, string> = {
  MANAGER: 'مدير',
  STAFF: 'موظف',
  EDITOR: 'محرر منتجات',
};

const ROLE_HINTS: Record<StoreMemberRole, string> = {
  MANAGER: 'إدارة المنتجات والعروض والموظفين والإعدادات',
  STAFF: 'عرض المنتجات (صلاحيات إضافية لاحقًا)',
  EDITOR: 'إضافة وتعديل المنتجات فقط',
};

const STATUS_LABELS = {
  PENDING: 'بانتظار القبول',
  ACTIVE: 'نشط',
  REMOVED: 'مزال',
} as const;

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'success' | 'warning'
> = {
  PENDING: 'warning',
  ACTIVE: 'success',
  REMOVED: 'secondary',
};

function InviteForm({ storeId }: { storeId: string }) {
  const invite = useInviteStoreMember(storeId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StoreMemberRole>('EDITOR');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    invite.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          setEmail('');
          setRole('EDITOR');
        },
      }
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="h-4 w-4" />
        دعوة عضو جديد
      </div>
      <p className="text-xs text-muted-foreground">
        يجب أن يكون لدى الشخص حساب مسجّل على المنصة بنفس البريد.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          type="email"
          aria-label="البريد الإلكتروني للعضو"
          placeholder="البريد الإلكتروني"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          dir="ltr"
          className="text-left"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as StoreMemberRole)}
          aria-label="دور العضو"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {(Object.keys(ROLE_LABELS) as StoreMemberRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={invite.isPending} className="gap-1.5">
          {invite.isPending ? <LoadingSpinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          دعوة
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
    </form>
  );
}

function MemberRow({
  member,
  storeId,
  selectionMode,
  selected,
  onToggle,
}: {
  member: StoreMember;
  storeId: string;
  selectionMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const updateRole = useUpdateStoreMemberRole(storeId);
  const removeMember = useRemoveStoreMember(storeId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const selectable = member.status !== 'REMOVED';

  return (
    <>
      <div
        onClick={selectionMode && selectable ? () => onToggle(member.id) : undefined}
        onKeyDown={(event) => {
          if (!selectionMode || !selectable) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle(member.id);
          }
        }}
        role={selectionMode && selectable ? 'checkbox' : undefined}
        aria-checked={selectionMode && selectable ? selected : undefined}
        tabIndex={selectionMode && selectable ? 0 : undefined}
        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${selectionMode && selectable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2' : ''} ${selected ? 'border-primary/40 bg-primary/10' : ''}`}
      >
        {selectionMode && selectable && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(member.id); }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border bg-background"
            aria-label={selected ? 'إلغاء التحديد' : 'تحديد'}
          >
            {selected && <Check className="h-4 w-4" />}
          </button>
        )}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
          {member.user.avatarUrl ? (
            <SafeImg
              variant="avatar"
              src={member.user.avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            member.user.name?.charAt(0) ?? '?'
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium truncate">{member.user.name}</span>
            <Badge variant={STATUS_VARIANTS[member.status] ?? 'secondary'}>
              {STATUS_LABELS[member.status] ?? member.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate dir-ltr text-left">
            {member.user.email}
          </p>
          <p className="text-xs text-muted-foreground">
            دعاه {member.invitedBy?.name ?? '—'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={member.role}
            disabled={updateRole.isPending || member.status === 'REMOVED'}
            onChange={(e) =>
              updateRole.mutate({
                memberId: member.id,
                payload: { role: e.target.value as StoreMemberRole },
              })
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {(Object.keys(ROLE_LABELS) as StoreMemberRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={removeMember.isPending || member.status === 'REMOVED'}
            onClick={() => setConfirmRemove(true)}
            aria-label="إزالة العضو"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="إزالة العضو؟"
        description={`سيتم إزالة ${member.user.name} من فريق المتجر. يمكن إعادة دعوته لاحقًا.`}
        confirmLabel="إزالة"
        destructive
        isPending={removeMember.isPending}
        onConfirm={() => {
          removeMember.mutate(member.id, {
            onSuccess: () => setConfirmRemove(false),
          });
        }}
      />
    </>
  );
}

export function MyStoreMembersList() {
  // BULK-MEMBERS-01: multi-select + bulk remove. Selection is lifted here
  // so the sticky bar can render at the list level (MemberRow stays dumb).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const {
    data: store,
    isLoading: storeLoading,
    isError: storeError,
    error: storeErr,
    refetch: refetchStore,
  } = useMyStore();

  const storeId = store?.id;
  const removeMemberBulk = useRemoveStoreMember(storeId ?? '');
  const {
    data: membersPage,
    isLoading: membersLoading,
    isError: membersError,
    refetch: refetchMembers,
  } = useStoreMembers(storeId);

  if (storeLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const statusCode = (storeErr as ParsedError | null)?.statusCode;
  if (storeError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات المتجر.</p>
        <button
          type="button"
          onClick={() => refetchStore()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (storeError || !store) {
    return <BecomeStoreOwnerCard />;
  }

  if (membersLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <AdListItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (membersError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل أعضاء الفريق</p>
        <button
          type="button"
          onClick={() => refetchMembers()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = membersPage?.items ?? [];

  // BULK-MEMBERS-01: sequential remove (no bulk endpoint).
  async function bulkRemove() {
    setConfirmBulkRemove(false);
    setBulkBusy(true);
    const ids = Array.from(selected);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await removeMemberBulk.mutateAsync(id);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    setSelectionMode(false);
    if (fail === 0) toast.success(`أُزيل ${ok} عضو`);
    else toast.error(`أُزيل ${ok} · فشل ${fail}`);
  }

  return (
    <div className="space-y-6">
      <InviteForm storeId={store.id} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">أعضاء الفريق</h2>
            <Badge variant="secondary">{items.length}</Badge>
          </div>
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setSelectionMode((v) => !v); setSelected(new Set()); }}
            >
              {selectionMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<Shield />}
            title="لا يوجد أعضاء بعد"
            description="ادعُ مديرًا أو محرر منتجات لمساعدتك في إدارة المتجر."
          />
        ) : (
          <div className="space-y-2">
            {items.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                storeId={store.id}
                selectionMode={selectionMode}
                selected={selected.has(m.id)}
                onToggle={(id) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}
      </section>

      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">صلاحيات الأدوار</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <strong>مدير:</strong> منتجات، عروض، مجموعات، موظفين، إعدادات
          </li>
          <li>
            <strong>محرر منتجات:</strong> إضافة وتعديل المنتجات فقط
          </li>
          <li>
            <strong>موظف:</strong> صلاحيات محدودة (قابلة للتوسيع لاحقًا)
          </li>
        </ul>
        <p>المالك فقط يستطيع ترقية عضو إلى مدير أو إزالة مدير.</p>
      </div>

      {selectionMode && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-2 rounded-lg border bg-card p-2 shadow-lg">
          <span className="text-sm font-medium">{selected.size} محدد</span>
          <div className="flex gap-1">
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmBulkRemove(true)}
              disabled={bulkBusy || selected.size === 0}
            >
              {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              إزالة
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectionMode(false); setSelected(new Set()); }}
              disabled={bulkBusy}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title={`إزالة ${selected.size} عضو؟`}
        description="سيتم إزالتهم من فريق المتجر. يمكن إعادة دعوتهم لاحقًا."
        confirmLabel="إزالة الأعضاء"
        destructive
        isPending={bulkBusy}
        onConfirm={() => void bulkRemove()}
      />
    </div>
  );
}
