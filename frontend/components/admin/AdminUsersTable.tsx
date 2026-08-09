'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldOff, ShieldCheck, ChevronDown, AlertTriangle, Crown, ShieldAlert, User as UserIcon } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Input }        from '@/components/shared/ui/Input';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';
import { useAdminUsers }  from '@/hooks/queries/useAdmin';
import { useAdminToggleUserActive, useAdminChangeRole } from '@/hooks/mutations/useAdminMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { formatDate }     from '@/lib/formatters';
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

const ROLE_BADGE: Record<UserRole, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }> = {
  USER:        { label: 'مستخدم',        variant: 'secondary' },
  MODERATOR:   { label: 'مشرف مساعد',    variant: 'outline', className: 'border-primary text-primary' },
  ADMIN:       { label: 'مدير',          variant: 'default' },
  SUPER_ADMIN: { label: 'مدير أعلى',     variant: 'default', className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
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
  const page   = Number(sp.get('page') ?? 1);
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

  const { data, isLoading, isError, refetch } = useAdminUsers({ page, q: q || undefined });
  const changeUserStatus = useAdminToggleUserActive();
  const changeRole       = useAdminChangeRole();
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

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

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
      <Input placeholder="بحث بالاسم أو البريد…" defaultValue={q}
        onBlur={(e) => search(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') search((e.target as HTMLInputElement).value); }}
        className="max-w-xs" />

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : isError ? (
        // UX-FIX P1-9 (admin variant): a failed fetch must not render as
        // "لا يوجد مستخدمون" — an admin reading that could wrongly
        // conclude the user table is genuinely empty.
        <div className="flex flex-col items-center gap-3 py-12 text-center rounded-lg border">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-destructive">حدث خطأ أثناء تحميل المستخدمين</p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
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
                      <span className="font-medium">{user.name}</span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Badge variant={badge.variant} className={`text-xs ${badge.className ?? ''}`}>
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant={user.isActive ? 'default' : 'destructive'} className="text-xs">
                        {user.isActive ? 'نشط' : 'موقوف'}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(user.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {/* FIX A11Y-01: title alone isn't reliably
                            announced by screen readers and is useless
                            for keyboard-only users (no hover). Kept
                            title for the visual tooltip, added
                            aria-label as the actual accessible name. */}
                        <Button variant="ghost" size="icon" className="h-9 w-9"
                          title={
                            isTargetSuperAdmin
                              ? 'لا يمكن تعديل حساب مدير أعلى'
                              : !canManageStatus
                                ? 'لا تملك صلاحية تعديل هذا الحساب'
                                : (user.isActive ? 'إيقاف' : 'تفعيل')
                          }
                          aria-label={user.isActive ? `إيقاف ${user.name}` : `تفعيل ${user.name}`}
                          disabled={!canManageStatus || pendingStatusUserId === user.id}
                          onClick={() => changeUserStatus.mutate({ userId: user.id, isActive: !user.isActive })}>
                          {user.isActive
                            ? <ShieldOff className="h-3.5 w-3.5 text-destructive" />
                            : <ShieldCheck className="h-3.5 w-3.5 text-success" />}
                        </Button>

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
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">لا يوجد مستخدمون</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}
