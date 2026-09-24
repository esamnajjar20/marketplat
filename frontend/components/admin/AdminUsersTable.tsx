'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldOff, ShieldCheck, ChevronDown, Crown, ShieldAlert, User as UserIcon, Search } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Input }        from '@/components/shared/ui/Input';
import { Checkbox }     from '@/components/shared/ui/Checkbox';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { Tooltip }      from '@/components/shared/ui/Tooltip';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { BulkActionBar } from '@/components/shared/admin/BulkActionBar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';
import { useAdminUsers }  from '@/hooks/queries/useAdmin';
import { useAdminToggleUserActive, useAdminChangeRole, useAdminBulkToggleUserActive } from '@/hooks/mutations/useAdminMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { formatDate }     from '@/lib/formatters';
import { parseApiError }  from '@/lib/errorParser';
import { USER_ACTIVE_STATUS_VARIANT, USER_ACTIVE_STATUS_LABELS, userActiveKey } from '@/lib/userActiveStatus';
import type { AdminUser, AssignableRole } from '@/types/admin.types';
import type { UserRole } from '@/types/auth.types';

// Gap #20 (admin permission tiers): frontend mirror of the backend's
// single source of truth (roleHierarchy.ts's canManageRole). This is
// UI convenience only — hiding/disabling options a request would be
// rejected for anyway — the backend re-checks the exact same rule for
// real on every request, so a mismatch here can only ever be overly
// strict, never a security hole.
const ROLE_RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

function canManageRole(actorRole: UserRole, targetCurrentRole: UserRole, targetNewRole: UserRole): boolean {
  const actorRank = ROLE_RANK[actorRole];
  if (actorRank < ROLE_RANK.ADMIN) return false;
  return ROLE_RANK[targetCurrentRole] < actorRank && ROLE_RANK[targetNewRole] < actorRank;
}

const ROLE_BADGE: Record<UserRole, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'; className?: string }> = {
  USER:        { label: 'مستخدم',        variant: 'secondary' },
  MODERATOR:   { label: 'مشرف مساعد',    variant: 'outline', className: 'border-primary text-primary' },
  ADMIN:       { label: 'مدير',          variant: 'default' },
  SUPER_ADMIN: { label: 'مدير أعلى',     variant: 'warning' },
};

const ROLE_ICON: Record<AssignableRole, typeof UserIcon> = {
  USER: UserIcon,
  MODERATOR: ShieldAlert,
  ADMIN: Crown,
};

// Every role an admin-tier actor could conceivably assign — narrowed
// per-row against the actor's own rank below. SUPER_ADMIN is not in
// this list at all: it's never assignable through this endpoint, for
// anyone (see AssignableRole's own doc comment).
const ASSIGNABLE_ROLES: AssignableRole[] = ['USER', 'MODERATOR', 'ADMIN'];

export function AdminUsersTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  // SW-ADMIN-PAGE-NAN-01: a hand-edited URL like ?page=abc
  // gave NaN here, which was sent to the backend as
  // ?page=NaN — a guaranteed 400 for what looks like a
  // valid URL. Clamp to a positive integer, fallback 1.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  // FIX BUG-02: sp.get() returns null (not undefined) when the param
  // is absent, so `?? ''` here previously turned "no filter" into a
  // literal empty string. That string then went straight into
  // useAdminUsers's `params` object, and axios serialises { q: '' }
  // as the real query string `?q=` — indistinguishable on the wire
  // from the user actually searching for nothing. The backend's Zod
  // schema (adminGetUsersSchema) only allows `q` to be a non-empty
  // string OR entirely absent (.optional() means undefined, not ''),
  // so it rejected every page load with no active search as a 400.
  // `q` itself stays '' for the Input's defaultValue below — only the
  // value handed to the query hook is normalised to undefined.
  const q      = sp.get('q') ?? '';

  const { data, isLoading, isError, error, refetch } = useAdminUsers({ page, q: q || undefined });
  const changeUserStatus = useAdminToggleUserActive();
  const changeRole       = useAdminChangeRole();
  const bulkChangeUserStatus = useAdminBulkToggleUserActive();
  const currentUser      = useAuthStore(selectUser);
  const actorRole: UserRole = (currentUser?.role as UserRole) ?? 'USER';

  // FIX UX-11: neither mutation disabled its own trigger button while
  // in flight — a fast double-click (or a slow network) could fire
  // the same status/role change twice concurrently. Track which user
  // id is mid-mutation for each action so only that row's button is
  // disabled, not the whole table.
  const pendingStatusUserId = changeUserStatus.isPending ? changeUserStatus.variables?.userId : undefined;
  const pendingRoleUserId   = changeRole.isPending ? changeRole.variables?.userId : undefined;

  // FIX AUDIT-V3-05: role changes are significant (granting/revoking
  // admin access), so unlike the active/inactive toggle this goes
  // through an explicit confirmation step rather than firing on a
  // single click.
  const [roleTarget, setRoleTarget] = useState<{ id: string; currentRole: UserRole; nextRole: AssignableRole; name: string } | null>(null);

  const items      = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  // BULK-ADMIN (item 17): bulk selection is scoped to active/inactive
  // only (see this table's own comment below on why role changes are
  // never batched). A row is only selectable when canManageStatus is
  // true for it — the exact same canManageRole(actorRole, userRole,
  // userRole) check the single-row button already applies — so an
  // admin can never select a row the backend would reject anyway
  // (SUPER_ADMIN targets, peers/superiors by rank).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusConfirm, setBulkStatusConfirm] = useState<'activate' | 'deactivate' | null>(null);

  const selectableIds = useMemo(
    () => items
      .filter((u: AdminUser) => (u.role as UserRole) !== 'SUPER_ADMIN' && canManageRole(actorRole, u.role as UserRole, u.role as UserRole))
      .map((u: AdminUser) => u.id),
    [items, actorRole],
  );
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, q]);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelectableSelected ? new Set() : new Set(selectableIds));
  }

  function search(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('q', value); else params.delete('q');
    params.delete('page');
    router.push(`/admin/users?${params.toString()}`);
  }

  function roleChangeCopy(nextRole: AssignableRole) {
    switch (nextRole) {
      case 'ADMIN':
        return {
          title: 'ترقية إلى مدير؟',
          description: (name: string) => `سيحصل "${name}" على صلاحيات كاملة للوحة الإدارة، بما فيها إدارة المستخدمين والإعلانات والبائعين والمتاجر.`,
          confirmLabel: 'ترقية',
          destructive: false,
        };
      case 'MODERATOR':
        return {
          title: 'تعيين كمشرف مساعد؟',
          description: (name: string) => `سيتمكن "${name}" من إدارة الإعلانات والبلاغات فقط — لن يصل إلى المستخدمين أو الإعدادات الأخرى.`,
          confirmLabel: 'تعيين',
          destructive: false,
        };
      case 'USER':
      default:
        return {
          title: 'التنزيل إلى مستخدم عادي؟',
          description: (name: string) => `سيفقد "${name}" كل صلاحيات الإدارة فوراً، وسيتم إنهاء جميع جلساته الحالية.`,
          confirmLabel: 'تنزيل',
          destructive: true,
        };
    }
  }

  return (
    <div className="space-y-4">
      {/* FIX BUG-XX: defaultValue is uncontrolled, so it only reflects `q`
          on first mount. Browser back/forward changes `q` via history
          navigation (no remount), leaving the input showing stale text
          while the URL/results are already correct. `key={q}` forces a
          fresh mount whenever `q` changes from an external source. */}
      <Input key={q} placeholder="بحث بالاسم أو البريد…" aria-label="بحث بالاسم أو البريد" defaultValue={q}
        onBlur={(e) => search(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') search((e.target as HTMLInputElement).value); }}
        className="max-w-xs" />

      <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <Button variant="outline" size="sm" className="h-7"
          onClick={() => setBulkStatusConfirm('activate')}>
          <ShieldCheck className="h-3.5 w-3.5 me-1 text-success" />تفعيل المحدد
        </Button>
        <Button variant="outline" size="sm" className="h-7"
          onClick={() => setBulkStatusConfirm('deactivate')}>
          <ShieldOff className="h-3.5 w-3.5 me-1 text-destructive" />إيقاف المحدد
        </Button>
      </BulkActionBar>

      {isLoading ? (
        // FIX AUDIT-1: TableSkeleton instead of a centered LoadingSpinner
        // on refetch — see AdminAdsTable for the full rationale.
        <TableSkeleton columns={7} />
      ) : isError ? (
        // UX-FIX P1-9 (admin variant): a failed fetch must not render as
        // "لا يوجد مستخدمون" — an admin reading that could wrongly
        // conclude the user table is genuinely empty.
        // FIX AUDIT-1: shared ApiError instead of a hand-rolled block —
        // see AdminAdsTable for the full rationale.
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      ) : (
        <>
        <div className="space-y-2 md:hidden">
          {items.map((user: AdminUser) => {
            const userRole = user.role as UserRole;
            const badge = ROLE_BADGE[userRole];
            const isTargetSuperAdmin = userRole === 'SUPER_ADMIN';
            const canManageStatus = !isTargetSuperAdmin && canManageRole(actorRole, userRole, userRole);
            return (
              <div key={user.id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
                <div className="flex items-start gap-3">
                  {canManageStatus ? (
                    <Checkbox
                      checked={selectedIds.has(user.id)}
                      onChange={() => toggleOne(user.id)}
                      aria-label={`تحديد ${user.name}`}
                      className="mt-0.5"
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-semibold leading-snug">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <Badge variant={badge.variant} className={`text-xs ${badge.className ?? ''}`}>
                        {badge.label}
                      </Badge>
                      <Badge variant={USER_ACTIVE_STATUS_VARIANT[userActiveKey(user.isActive)]} className="text-xs">
                        {USER_ACTIVE_STATUS_LABELS[userActiveKey(user.isActive)]}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-lg border md:block">
          <table className="w-full min-w-[640px] text-sm [&_th:last-child]:sticky [&_th:last-child]:end-0 [&_th:last-child]:z-10 [&_th:last-child]:bg-muted/50 [&_td:last-child]:sticky [&_td:last-child]:end-0 [&_td:last-child]:z-10 [&_td:last-child]:bg-background [&_td:last-child]:shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-10 p-3">
                  {selectableIds.length > 0 && (
                    <Checkbox checked={allSelectableSelected} onChange={toggleAll} aria-label="تحديد كل المستخدمين" />
                  )}
                </th>
                <th className="text-start p-3 font-medium">المستخدم</th>
                <th className="text-start p-3 font-medium hidden md:table-cell">البريد</th>
                <th className="text-start p-3 font-medium">الدور</th>
                <th className="text-start p-3 font-medium hidden sm:table-cell">الحالة</th>
                <th className="text-start p-3 font-medium hidden lg:table-cell">تاريخ التسجيل</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((user: AdminUser) => {
                const userRole = user.role as UserRole;
                const badge = ROLE_BADGE[userRole];
                // Gap #20: SUPER_ADMIN's role/status can never be
                // touched through this table — canManageRole rejects
                // it for every actor, including another SUPER_ADMIN
                // (break-glass, DB-only). Disable both action buttons
                // outright rather than showing controls that would
                // always 403.
                const isTargetSuperAdmin = userRole === 'SUPER_ADMIN';
                const canManageStatus = !isTargetSuperAdmin && canManageRole(actorRole, userRole, userRole);
                const canManageAnyRole = !isTargetSuperAdmin && ASSIGNABLE_ROLES.some(
                  (r) => r !== userRole && canManageRole(actorRole, userRole, r),
                );

                return (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      {canManageStatus && (
                        <Checkbox
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleOne(user.id)}
                          aria-label={`تحديد ${user.name}`}
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-medium">{user.name}</span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Badge variant={badge.variant} className={`text-xs ${badge.className ?? ''}`}>
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant={USER_ACTIVE_STATUS_VARIANT[userActiveKey(user.isActive)]} className="text-xs">
                        {USER_ACTIVE_STATUS_LABELS[userActiveKey(user.isActive)]}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(user.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {/* DESKTOP-AUDIT-01: title= → Tooltip, same
                            content this button already computed for its
                            (unstyled, inconsistent-across-browsers)
                            native title — aria-label untouched, it's the
                            real accessible name for screen readers. */}
                        <Tooltip
                          content={
                            isTargetSuperAdmin
                              ? 'لا يمكن تعديل حساب مدير أعلى'
                              : !canManageStatus
                                ? 'لا تملك صلاحية تعديل هذا الحساب'
                                : (user.isActive ? 'إيقاف' : 'تفعيل')
                          }
                        >
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={user.isActive ? `إيقاف ${user.name}` : `تفعيل ${user.name}`}
                            disabled={!canManageStatus || pendingStatusUserId === user.id}
                            onClick={() => changeUserStatus.mutate({ userId: user.id, isActive: !user.isActive })}>
                            {user.isActive
                              ? <ShieldOff className="h-3.5 w-3.5 text-destructive" />
                              : <ShieldCheck className="h-3.5 w-3.5 text-success" />}
                          </Button>
                        </Tooltip>

                        {/* FIX AUDIT-V3-05 / Gap #20: role menu — replaces
                            the old two-way USER<->ADMIN toggle now that
                            there are four ranked roles. Each option is
                            individually enabled/disabled based on
                            canManageRole, mirroring the backend's own
                            per-request check exactly. */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 gap-1 px-2"
                              title={
                                isTargetSuperAdmin
                                  ? 'لا يمكن تعديل دور مدير أعلى'
                                  : !canManageAnyRole
                                    ? 'لا تملك صلاحية تغيير هذا الدور'
                                    : 'تغيير الدور'
                              }
                              aria-label={`تغيير دور ${user.name}`}
                              disabled={!canManageAnyRole || pendingRoleUserId === user.id}>
                              <span className="sr-only sm:not-sr-only sm:text-xs">تغيير الدور</span>
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">تعيين كـ</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {ASSIGNABLE_ROLES.map((candidateRole) => {
                              const Icon = ROLE_ICON[candidateRole];
                              const isCurrent = candidateRole === userRole;
                              const allowed = !isCurrent && canManageRole(actorRole, userRole, candidateRole);
                              return (
                                <DropdownMenuItem
                                  key={candidateRole}
                                  disabled={isCurrent || !allowed}
                                  onSelect={() => setRoleTarget({
                                    id: user.id,
                                    currentRole: userRole,
                                    nextRole: candidateRole,
                                    name: user.name,
                                  })}
                                >
                                  <Icon className="h-3.5 w-3.5 me-2" />
                                  {ROLE_BADGE[candidateRole].label}
                                  {isCurrent && <span className="text-xs text-muted-foreground ms-auto">(الحالي)</span>}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={7}><EmptyState icon={<Search className="h-8 w-8" />} title="لا يوجد مستخدمون" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl="/admin/users" searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={roleTarget !== null}
        onOpenChange={(open) => { if (!open) setRoleTarget(null); }}
        title={roleTarget ? roleChangeCopy(roleTarget.nextRole).title : ''}
        description={roleTarget ? roleChangeCopy(roleTarget.nextRole).description(roleTarget.name) : ''}
        confirmLabel={roleTarget ? roleChangeCopy(roleTarget.nextRole).confirmLabel : 'تأكيد'}
        destructive={roleTarget ? roleChangeCopy(roleTarget.nextRole).destructive : false}
        isPending={changeRole.isPending}
        onConfirm={() => {
          if (!roleTarget) return;
          changeRole.mutate(
            { userId: roleTarget.id, role: roleTarget.nextRole },
            { onSuccess: () => setRoleTarget(null) },
          );
        }}
      />

      {/* BULK-ADMIN (item 17): active/inactive only — a deactivation is
          reversible (unlike a role change), so this mirrors the
          activate/deactivate flow's own low-friction nature rather
          than the heavier role-change dialog above, but still confirms
          since it can affect many accounts at once from one click. */}
      <ConfirmDialog
        open={bulkStatusConfirm !== null}
        onOpenChange={(open) => { if (!open) setBulkStatusConfirm(null); }}
        title={
          bulkStatusConfirm === 'activate'
            ? `تفعيل ${selectedIds.size} حساب؟`
            : `إيقاف ${selectedIds.size} حساب؟`
        }
        description={
          bulkStatusConfirm === 'deactivate'
            ? 'سيتم إنهاء جلسات هذه الحسابات فوراً ولن يتمكنوا من تسجيل الدخول.'
            : 'ستتمكن هذه الحسابات من تسجيل الدخول مجدداً.'
        }
        confirmLabel={bulkStatusConfirm === 'activate' ? 'تفعيل' : 'إيقاف'}
        destructive={bulkStatusConfirm === 'deactivate'}
        isPending={bulkChangeUserStatus.isPending}
        onConfirm={() => {
          if (!bulkStatusConfirm) return;
          bulkChangeUserStatus.mutate(
            { userIds: Array.from(selectedIds), isActive: bulkStatusConfirm === 'activate' },
            {
              onSuccess: () => {
                setSelectedIds(new Set());
                setBulkStatusConfirm(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
