'use client';

import { useAdminStats } from '@/hooks/queries/useAdmin';
import { ApiError } from '@/components/shared/ApiError';
import { parseApiError } from '@/lib/errorParser';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { formatNumber } from '@/lib/formatters';
import { ShoppingBag, Users, Flag, Eye, UserPlus, CalendarDays, CalendarRange } from 'lucide-react';

export function AdminStatsGrid() {
  const { data, isLoading, isError, error, refetch } = useAdminStats();

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  // UX-FIX P1-11 (admin variant of the DashboardStats fix): the `?? 0`
  // fallbacks below meant a failed fetch rendered as "0" across every
  // metric with no indication anything was wrong — an admin could
  // misread that as "zero open reports" rather than "stats didn't load".
  // SW-FIX-ASG-APIERROR: shared ApiError for 401/403/404/500+
  // differentiation, consistent with every other admin surface.
  if (isError) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  const stats = [
    // FIX A11Y/UX-01: blue-500/purple-500 were stock Tailwind colors
    // unrelated to the brand palette (see app/globals.css) — swapped
    // for primary/accent so this grid's four distinguishing colors are
    // all tokens from the actual design system rather than two branded
    // (success/destructive) and two arbitrary ones.
    { label: 'إجمالي الإعلانات',  value: data?.totalAds ?? 0,     icon: ShoppingBag, color: 'text-primary' },
    { label: 'المستخدمون النشطون', value: data?.activeUsers ?? 0,  icon: Users,       color: 'text-success' },
    { label: 'البلاغات المفتوحة',  value: data?.openReports ?? 0,  icon: Flag,        color: 'text-destructive' },
    // FIX FEAT-05: viewsToday is now a real figure from GET /admin/stats
    // (sum of views on ads created today + buffered increments) — was
    // previously omitted here since the backend had no value to give.
    { label: 'مشاهدات اليوم',      value: data?.viewsToday ?? 0,   icon: Eye,         color: 'text-accent' },
    // FEAT: new-registration counts — same GET /admin/stats response,
    // see admin.service.ts's getStats for the exact today/week/month
    // boundary definitions.
    { label: 'مستخدمون جدد اليوم',      value: data?.newUsersToday ?? 0,     icon: UserPlus,     color: 'text-primary' },
    { label: 'مستخدمون جدد هذا الأسبوع', value: data?.newUsersThisWeek ?? 0,  icon: CalendarDays, color: 'text-success' },
    { label: 'مستخدمون جدد هذا الشهر',   value: data?.newUsersThisMonth ?? 0, icon: CalendarRange, color: 'text-accent' },
  ];

  return (
    <section aria-label="مؤشرات المنصة" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">مؤشرات المنصة</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">أرقام سريعة تساعدك على تحديد الأولويات.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-lg border bg-card p-4 space-y-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <p className="text-2xl font-bold">{formatNumber(value)}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      ))}
      </div>
    </section>
  );
}
