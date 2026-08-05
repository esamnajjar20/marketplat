'use client';

/**
 * Gap #7 (product analytics): admin dashboard for GET
 * /admin/analytics/summary. No charting library exists in this project
 * (package.json has no recharts/chart.js — see AdminStatsGrid.tsx and
 * every other admin view, all plain cards/tables), so the trend line
 * is a lightweight CSS/SVG bar chart rather than pulling in a new
 * dependency for one view.
 */
import { useState } from 'react';
import { useAdminAnalyticsSummary } from '@/hooks/queries/useAdmin';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { AlertTriangle, Eye, Search, Tag, MessageSquare, UserPlus, FileText } from 'lucide-react';
import type { AnalyticsEventType } from '@/lib/analytics';

const EVENT_LABELS: Record<AnalyticsEventType, string> = {
  PAGE_VIEW: 'مشاهدات الصفحات',
  AD_VIEW: 'مشاهدات الإعلانات',
  SEARCH: 'عمليات البحث',
  CATEGORY_BROWSE: 'تصفّح الفئات',
  CONTACT_CLICK: 'نقرات التواصل',
  SIGNUP_STARTED: 'بدء التسجيل',
  SIGNUP_COMPLETED: 'إكمال التسجيل',
};

const RANGE_OPTIONS = [
  { label: '7 أيام', days: 7 },
  { label: '30 يومًا', days: 30 },
  { label: '90 يومًا', days: 90 },
] as const;

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('ar', { maximumFractionDigits: 1 })}%`;
}

export function AdminAnalyticsDashboard() {
  const [rangeDays, setRangeDays] = useState<number>(30);

  const from = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
  const bucket = rangeDays > 30 ? 'week' : 'day';

  const { data, isLoading, isError, refetch } = useAdminAnalyticsSummary({ from, bucket });

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center rounded-lg border">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل بيانات التحليلات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const totalsCards = [
    { label: EVENT_LABELS.PAGE_VIEW, value: data.totals.PAGE_VIEW, icon: FileText },
    { label: EVENT_LABELS.AD_VIEW, value: data.totals.AD_VIEW, icon: Eye },
    { label: EVENT_LABELS.SEARCH, value: data.totals.SEARCH, icon: Search },
    { label: EVENT_LABELS.CATEGORY_BROWSE, value: data.totals.CATEGORY_BROWSE, icon: Tag },
    { label: EVENT_LABELS.CONTACT_CLICK, value: data.totals.CONTACT_CLICK, icon: MessageSquare },
  ];

  // Group trend rows by bucket date so each column in the chart can
  // show all event types stacked as separate bars side by side —
  // simplest readable shape without a charting library.
  const bucketDates = Array.from(new Set(data.trend.map((t) => t.bucket))).sort();
  const maxCount = Math.max(1, ...data.trend.map((t) => t.count));

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => setRangeDays(opt.days)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              rangeDays === opt.days
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {totalsCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border bg-card p-4 space-y-2">
            <Icon className="h-5 w-5 text-primary" />
            <p className="text-2xl font-bold">{value.toLocaleString('ar')}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Conversion funnels — the two numbers the original audit
          flagged as missing (search→contact, signup drop-off). */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm">معدل التحويل: بحث → تواصل</h3>
          <p className="text-3xl font-bold text-primary">
            {formatPercent(data.searchToContact.conversionRate)}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.searchToContact.contactSessions.toLocaleString('ar')} من أصل{' '}
            {data.searchToContact.searchSessions.toLocaleString('ar')} جلسة بحث تواصلت مع بائع
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <UserPlus className="h-4 w-4" /> معدل إكمال التسجيل
          </h3>
          <p className="text-3xl font-bold text-primary">
            {formatPercent(data.signupFunnel.conversionRate)}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.signupFunnel.completedSessions.toLocaleString('ar')} من أصل{' '}
            {data.signupFunnel.startedSessions.toLocaleString('ar')} محاولة تسجيل اكتملت
          </p>
        </div>
      </div>

      {/* Trend — simple bar chart, no charting library (see file header) */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">الاتجاه الزمني (مشاهدات الإعلانات)</h3>
        {bucketDates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">لا توجد بيانات كافية لهذه الفترة</p>
        ) : (
          <div className="flex items-end gap-1 h-40">
            {bucketDates.map((date) => {
              const count =
                data.trend.find((t) => t.bucket === date && t.event === 'AD_VIEW')?.count ?? 0;
              const heightPct = (count / maxCount) * 100;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div
                    className="w-full bg-primary/70 rounded-t-sm"
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                    title={`${new Date(date).toLocaleDateString('ar')}: ${count.toLocaleString('ar')}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top categories */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="font-semibold text-sm">أكثر الفئات تصفحًا</h3>
        {data.topCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">لا توجد بيانات كافية لهذه الفترة</p>
        ) : (
          <ul className="space-y-2">
            {data.topCategories.map((cat) => (
              <li key={cat.categoryId} className="flex items-center justify-between text-sm">
                <span>{cat.nameAr ?? cat.categoryId}</span>
                <span className="font-medium">{cat.count.toLocaleString('ar')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
