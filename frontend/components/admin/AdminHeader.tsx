'use client';

import Link from 'next/link';
import { LogOut, Bell } from 'lucide-react';
import { Button }      from '@/components/shared/ui/Button';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useLogout }   from '@/hooks/mutations/useAuthMutations';
import { ROUTES }      from '@/lib/constants';
import { useAdminStats } from '@/hooks/queries/useAdmin';

export function AdminHeader() {
  const user   = useAuthStore(selectUser);
  const { data: stats } = useAdminStats();
  const openReports = stats?.openReports ?? 0;

  /**
   * AUDIT-FIX (admin #1 — critical): this used to be a hand-rolled
   * handleLogout that only called useAuthStore's logout() (Zustand
   * state only) before pushing to /login. That skipped four of the
   * five steps the already-existing, already-tested useLogout() hook
   * performs via useClearLocalSession — clearAuthCookies()
   * (app_access_token/app_user_role/app_has_session), 
   * clearServiceWorkerApiCache(), and queryClient.clear() — leaving
   * live admin-role cookies and a full React Query cache of admin data
   * (users, reports, stores) sitting in the browser after "logging
   * out". Combined with AuthHydrationProvider's automatic /auth/refresh
   * on mount, this could silently re-authenticate the admin, or leave
   * admin data readable in memory on a shared machine. Switched to the
   * same useLogout() UserMenu already uses in (protected) — no new
   * code, just routing through the hook that already does this right.
   */
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0">
      <Link href="/admin/dashboard" className="font-bold text-sm text-primary">
        سوق غزة — إدارة
      </Link>
      <div className="flex items-center gap-2">
        {/*
         * FIX A11Y-01: icon-only buttons had no accessible name at
         * all — not even a title.
         *
         * FIX INTEG-09: previously had no onClick at all — a bell icon
         * that looked interactive but did nothing. There is no
         * notification system in the backend (only notification
         * *preferences*, a different feature) to wire a real inbox to,
         * so rather than build a fake one this links to the one thing
         * in the app that is actually notification-shaped: pending
         * reports, already tracked by getStats().openReports and shown
         * elsewhere on the admin dashboard.
         */}
        <Link href={ROUTES.admin.reports} className="relative">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`الإشعارات — ${openReports} بلاغ بانتظار المراجعة`}>
            <Bell className="h-4 w-4" />
            {openReports > 0 && (
              <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                {openReports > 99 ? '99+' : openReports}
              </span>
            )}
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => logout()}
          disabled={isLoggingOut}
          aria-label="تسجيل الخروج"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
