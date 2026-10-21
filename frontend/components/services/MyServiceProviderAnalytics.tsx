'use client';

import type { ComponentType } from 'react';
import Image from 'next/image';
import { Eye, ListChecks, Clock, CheckCircle2, CalendarClock, Wallet, Star, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/Card';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useState } from 'react';
import { useMyServiceProviderAnalytics } from '@/hooks/queries/useServiceProviders';
import { getThumbnailUrl } from '@/lib/cloudinary';
import { formatPrice } from '@/lib/formatters';
import type { ParsedError } from '@/lib/errorParser';
import { cn } from '@/lib/utils';

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            accent ? 'bg-[#FBF0D9] text-[#7A4B07]' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
      </div>
      <b className="text-lg font-extrabold tabular-nums leading-none tracking-tight">{value}</b>
    </div>
  );
}

export function MyServiceProviderAnalytics() {
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('all');
  const { data: analytics, isLoading, isError, error, refetch } = useMyServiceProviderAnalytics(period);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  const statusCode = (error as ParsedError | null)?.statusCode;
  if (isError && statusCode === 404) {
    return (
      <EmptyState
        icon={<ListChecks className="h-8 w-8" />}
        title="لا يوجد ملف مقدم خدمة بعد"
        description="أنشئ ملف مقدم خدمة أولاً لترى إحصائياته هنا."
      />
    );
  }

  if (isError || !analytics) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل إحصائيات مقدم الخدمة. يرجى المحاولة مرة أخرى.</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="فترة الإحصائيات">
        {([
          ['all', 'الكل'],
          ['7d', '7 أيام'],
          ['30d', '30 يوماً'],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setPeriod(val)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors',
              period === val
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        النافذة الزمنية تؤثر على الطلبات المكتملة والإيرادات. المشاهدات والخدمات النشطة تبقى إجمالية.
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
        <StatTile icon={Eye} label="مشاهدات الخدمات" value={analytics.totalViews.toLocaleString('ar')} />
        <StatTile icon={ListChecks} label="خدمات نشطة" value={analytics.activeListings.toLocaleString('ar')} />
        <StatTile icon={Clock} label="طلبات معلّقة" value={analytics.pendingRequests.toLocaleString('ar')} />
        <StatTile icon={CheckCircle2} label="طلبات مكتملة" value={analytics.completedRequests.toLocaleString('ar')} />
        <StatTile
          icon={TrendingUp}
          label="معدّل الإنجاز"
          value={analytics.fulfillmentRate !== null ? `${analytics.fulfillmentRate.toFixed(0)}%` : '—'}
        />
        <StatTile
          icon={CalendarClock}
          label="مواعيد قادمة"
          value={analytics.upcomingAppointments.toLocaleString('ar')}
        />
        <StatTile
          icon={Star}
          label="التقييم"
          value={analytics.averageRating !== null ? analytics.averageRating.toFixed(1) : '—'}
          accent
        />
        <StatTile icon={Wallet} label="الإيرادات" value={formatPrice(analytics.revenue)} />
      </div>

      <Card className="rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-extrabold">الأكثر مشاهدة</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.topListings.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات مشاهدات بعد.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {analytics.topListings.map((listing, index) => (
                <li key={listing.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
                      index === 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {listing.image && (
                      <Image
                        src={getThumbnailUrl(listing.image, 40, 40)}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{listing.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {listing.views.toLocaleString('ar')} مشاهدة
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
