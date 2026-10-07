// FIX ADMIN-HEADER-USER-NULL-01: report.user accessed without optional
// chain in the bell dropdown preview -- crashed the admin header when a
// report's reporter record was missing.
'use client';

import Link from 'next/link';
import { LogOut, Bell, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button }      from '@/components/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useLogout }   from '@/hooks/mutations/useAuthMutations';
import { ROUTES, REPORT_REASON_LABELS } from '@/lib/constants';
import { useAdminStats, useAdminReports } from '@/hooks/queries/useAdmin';
import { formatRelativeTime } from '@/lib/formatters';

export function AdminHeader() {
  const user   = useAuthStore(selectUser);
  const { data: stats } = useAdminStats();
  const openReports = stats?.openReports ?? 0;

  // FIX P2-12: the bell only ever linked straight to /admin/reports
  // with no way to see what's actually pending before committing to a
  // full page navigation. Pulls the same 3-5 most recent PENDING
  // reports the reports page itself would show first (default sort is
  // createdAt desc), reusing useAdminReports — no new endpoint needed.
  // Only fetches when there's actually something to preview.
  const { data: recentReportsPage } = useAdminReports({ status: 'PENDING', limit: 5 });
  const recentReports = recentReportsPage?.items ?? [];

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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/80 ps-12 md:ps-4 bg-background/90 px-4 shadow-xs backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="flex min-w-0 items-center gap-2">
        <Link prefetch={false} href={ROUTES.admin.dashboard} className="shrink-0 font-bold text-sm text-primary">
          سوق غزة — إدارة
        </Link>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
        <span className="hidden truncate text-xs text-muted-foreground sm:block">مركز المراجعة والتشغيل</span>
      </div>
      <div className="flex items-center gap-2">
        {/*
         * UX-FIX: there was previously no way back to the public site
         * from inside (admin) short of logging out entirely (which
         * also tears down the session) or manually editing the URL.
         * A plain link to the home route — admins are also regular
         * authenticated users, so this doesn't need its own auth check
         * or route, just a way back to the site they're already
         * signed into.
         */}
        {/* SW-FIX-HEADER-TITLE-A11Y: the visible label ('العودة للموقع')
            is the accessible name on sm+; on mobile only the icon shows,
            so aria-label carries it there. The static title= added no new
            information and shadowed the visible text for screen readers. */}
        <Button asChild variant="ghost" size="sm" className="gap-1.5" aria-label="العودة للموقع">
          <Link prefetch={false} href={ROUTES.home}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">العودة للموقع</span>
          </Link>
        </Button>
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
         *
         * FIX P2-12: now a dropdown preview (mirrors NotificationBell's
         * own DropdownMenu pattern) instead of a bare link — shows the
         * latest pending reports so an admin can judge urgency before
         * committing to the full reports page.
         */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={`الإشعارات — ${openReports} بلاغ بانتظار المراجعة`}>
              <Bell className="h-4 w-4" />
              {openReports > 0 && (
                <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-medium text-destructive-foreground">
                  {openReports > 99 ? '99+' : openReports}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <DropdownMenuLabel className="p-3 font-normal">البلاغات الأخيرة</DropdownMenuLabel>
            <DropdownMenuSeparator className="m-0" />
            {recentReports.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">لا توجد بلاغات بانتظار المراجعة</p>
            ) : (
              <div className="divide-y">
                {recentReports.map((report) => (
                  <Link prefetch={false}
                    key={report.id}
                    href={ROUTES.admin.reports}
                    className="flex items-start gap-2.5 p-3 text-start transition-colors hover:bg-muted/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium line-clamp-1">
                        {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {/* FIX ADMIN-HEADER-USER-NULL-01: report.user was
                            accessed without an optional chain -- same field
                            already handled defensively as report.user?.name
                            ?? '—' in AdminReportsTable. If the reporter's
                            user record is missing (deleted account, stale
                            report row, or a target type where `user` isn't
                            populated), the header crashed mid-render inside
                            the bell dropdown, breaking every admin page. */}
                        {report.targetType === 'AD' && report.ad
                          ? report.ad.title
                          : (report.user?.name ?? '—')}
                      </p>
                      <p className="text-2xs text-muted-foreground">{formatRelativeTime(report.createdAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <DropdownMenuSeparator className="m-0" />
            <Link prefetch={false} href={ROUTES.admin.reports} className="block p-3 text-center text-sm text-primary hover:underline">
              عرض كل البلاغات
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-sm text-muted-foreground hidden sm:block">{user?.name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
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
