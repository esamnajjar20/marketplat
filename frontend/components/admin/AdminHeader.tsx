'use client';

import Link from 'next/link';
import { LogOut, Bell } from 'lucide-react';
import { Button }      from '@/components/shared/ui/Button';
import { useAuthStore, selectUser, selectLogout } from '@/store/auth.store';
import { authApi }     from '@/api/auth.api';
import { useRouter }   from 'next/navigation';
import { ROUTES }      from '@/lib/constants';
import { useAdminStats } from '@/hooks/queries/useAdmin';

export function AdminHeader() {
  const user   = useAuthStore(selectUser);
  const logout = useAuthStore(selectLogout);
  const router = useRouter();
  const { data: stats } = useAdminStats();
  const openReports = stats?.openReports ?? 0;

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // Best-effort: local session is cleared and the user is
      // redirected below regardless of whether the backend call
      // succeeded — a failed logout request shouldn't strand the
      // user in a logged-in-looking admin UI, and shouldn't surface
      // as an unhandled rejection either.
    } finally {
      logout();
      router.push(ROUTES.login);
    }
  }

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
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} aria-label="تسجيل الخروج">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
