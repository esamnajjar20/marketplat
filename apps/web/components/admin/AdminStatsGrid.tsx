'use client';

import { useAdminStats } from '@/hooks/queries/useAdmin';
import { ApiError } from '@/components/shared/ApiError';
import { parseApiError } from '@/lib/errorParser';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { formatNumber } from '@/lib/formatters';
import { ShoppingBag, Users, Flag, Eye, UserPlus, CalendarDays, CalendarRange } from 'lucide-react';

export function AdminStatsGrid() {
  const { data, isLoading, isError, error, refetch } = useAdminStats();

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-[14px] border border-[#EAE3D6] bg-card py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  const stats = [
    { label: 'إجمالي الإعلانات', value: data?.totalAds ?? 0, icon: ShoppingBag },
    { label: 'المستخدمون النشطون', value: data?.activeUsers ?? 0, icon: Users },
    { label: 'البلاغات المفتوحة', value: data?.openReports ?? 0, icon: Flag },
    { label: 'مشاهدات اليوم', value: data?.viewsToday ?? 0, icon: Eye },
    { label: 'مستخدمون جدد اليوم', value: data?.newUsersToday ?? 0, icon: UserPlus },
    { label: 'مستخدمون جدد هذا الأسبوع', value: data?.newUsersThisWeek ?? 0, icon: CalendarDays },
    { label: 'مستخدمون جدد هذا الشهر', value: data?.newUsersThisMonth ?? 0, icon: CalendarRange },
  ];

  return (
    <section aria-label="مؤشرات المنصة" className="space-y-3">
      <div>
        <h2 className="text-[15px] font-extrabold tracking-tight">مؤشرات المنصة</h2>
        <p className="mt-0.5 text-[12px] text-[#6B6459]">أرقام سريعة تساعدك على تحديد الأولويات.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex flex-col gap-1.5 rounded-[14px] border border-[#EAE3D6] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.05)]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F6F1E7] text-primary">
              <Icon className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <p className="text-[22px] font-extrabold tabular-nums leading-none">{formatNumber(value)}</p>
            <p className="text-[12px] text-[#6B6459]">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
