'use client';

import { useAdminStats } from '@/hooks/queries/useAdmin';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ShoppingBag, Users, Flag, Eye, AlertTriangle } from 'lucide-react';

export function AdminStatsGrid() {
  const { data, isLoading, isError, refetch } = useAdminStats();

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  // UX-FIX P1-11 (admin variant of the DashboardStats fix): the `?? 0`
  // fallbacks below meant a failed fetch rendered as "0" across every
  // metric with no indication anything was wrong — an admin could
  // misread that as "zero open reports" rather than "stats didn't load".
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الإحصائيات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
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
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-lg border bg-card p-4 space-y-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <p className="text-2xl font-bold">{value.toLocaleString('ar')}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
