'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldOff, ShieldCheck, Crown, UserMinus, AlertTriangle } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Input }        from '@/components/shared/ui/Input';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAdminUsers }  from '@/hooks/queries/useAdmin';
import { useAdminToggleUserActive, useAdminChangeRole } from '@/hooks/mutations/useAdminMutations';
import { formatDate }     from '@/lib/formatters';

export function AdminUsersTable() {
  const sp     = useSearchParams();
  const router = useRouter();
  const page   = Number(sp.get('page') ?? 1);
  const q      = sp.get('q') ?? '';

  const { data, isLoading, isError, refetch } = useAdminUsers({ page, q });
  const changeUserStatus = useAdminToggleUserActive();
  const changeRole       = useAdminChangeRole();

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
  const [roleTarget, setRoleTarget] = useState<{ id: string; nextRole: 'USER' | 'ADMIN'; name: string } | null>(null);

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  function search(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set('q', value); else params.delete('q');
    params.delete('page');
    router.push(`/admin/users?${params.toString()}`);
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
              {items.map((user) => {
                return (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      {/* FIX TYPE-ERROR-01: this row previously read
                          user.avatarUrl and rendered it via next/image
                          — but AdminUser (types/admin.types.ts) does
                          not have that field, matching what
                          adminService.getAllUsers actually selects
                          (id, name, email, phone, role, city, isActive,
                          createdAt, _count only) — a genuine TypeScript
                          type error that transpileModule-only syntax
                          checks never caught, since it never runs full
                          type-checking. Safe at runtime (avatarUrl was
                          simply undefined, and getAvatarUrl('') already
                          falls back to a placeholder), but still wrong
                          — removed the avatar image entirely rather
                          than adding a field the backend deliberately
                          does not expose here. */}
                      <span className="font-medium">{user.name}</span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'} className="text-xs">
                        {user.role === 'ADMIN' ? 'مشرف' : 'مستخدم'}
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
                          title={user.isActive ? 'إيقاف' : 'تفعيل'}
                          aria-label={user.isActive ? `إيقاف ${user.name}` : `تفعيل ${user.name}`}
                          disabled={user.role === 'ADMIN' || pendingStatusUserId === user.id}
                          onClick={() => changeUserStatus.mutate({ userId: user.id, isActive: !user.isActive })}>
                          {user.isActive
                            ? <ShieldOff className="h-3.5 w-3.5 text-destructive" />
                            : <ShieldCheck className="h-3.5 w-3.5 text-success" />}
                        </Button>
                        {/* FIX AUDIT-V3-05: promote/demote role action */}
                        <Button variant="ghost" size="icon" className="h-9 w-9"
                          title={user.role === 'ADMIN' ? 'تنزيل إلى مستخدم' : 'ترقية إلى مدير'}
                          aria-label={
                            user.role === 'ADMIN'
                              ? `تنزيل ${user.name} إلى مستخدم`
                              : `ترقية ${user.name} إلى مدير`
                          }
                          disabled={pendingRoleUserId === user.id}
                          onClick={() => setRoleTarget({
                            id: user.id,
                            nextRole: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
                            name: user.name,
                          })}>
                          {user.role === 'ADMIN'
                            ? <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                            : <Crown className="h-3.5 w-3.5 text-warning" />}
                        </Button>
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
        title={roleTarget?.nextRole === 'ADMIN' ? 'ترقية إلى مدير؟' : 'تنزيل إلى مستخدم عادي؟'}
        description={
          roleTarget?.nextRole === 'ADMIN'
            ? `سيحصل "${roleTarget?.name}" على صلاحيات كاملة للوحة الإدارة، بما فيها إدارة المستخدمين والإعلانات.`
            : `سيفقد "${roleTarget?.name}" كل صلاحيات الإدارة فوراً، وسيتم إنهاء جميع جلساته الحالية.`
        }
        confirmLabel={roleTarget?.nextRole === 'ADMIN' ? 'ترقية' : 'تنزيل'}
        destructive={roleTarget?.nextRole === 'USER'}
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
