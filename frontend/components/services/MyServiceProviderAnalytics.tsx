'use client';

import Image from 'next/image';
import { Eye, ListChecks, Clock, CheckCircle2, CalendarClock, Wallet, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/Card';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMyServiceProviderAnalytics } from '@/hooks/queries/useServiceProviders';
import { getThumbnailUrl } from '@/lib/cloudinary';
import { formatPrice } from '@/lib/formatters';
import type { ParsedError } from '@/lib/errorParser';

/**
 * ANALYTICS: mirrors MyStoreAnalytics.tsx's structure exactly (same
 * StatCard grid + "top items" list layout) — see
 * service-providers.service.ts's getMyServiceProviderAnalytics for
 * where every number here comes from. Unlike MyStoreAnalytics, a
 * revenue tile is included: ServiceRequest.agreedPrice is a real
 * existing field (no Order model gap here the way stores have).
 */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function MyServiceProviderAnalytics() {
  const { data: analytics, isLoading, isError, error, refetch } = useMyServiceProviderAnalytics();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // Same "404 means no provider profile yet" convention useMyStoreAnalytics's
  // own callers already follow.
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Eye} label="مشاهدات الخدمات" value={analytics.totalViews.toLocaleString('ar')} />
        <StatCard icon={ListChecks} label="خدمات نشطة" value={analytics.activeListings.toLocaleString('ar')} />
        <StatCard icon={Clock} label="طلبات معلّقة" value={analytics.pendingRequests.toLocaleString('ar')} />
        <StatCard icon={CheckCircle2} label="طلبات مكتملة" value={analytics.completedRequests.toLocaleString('ar')} />
        <StatCard
          icon={Star}
          label="معدّل الإنجاز"
          value={analytics.fulfillmentRate !== null ? `${analytics.fulfillmentRate.toFixed(0)}%` : '—'}
        />
        <StatCard
          icon={CalendarClock}
          label="مواعيد قادمة"
          value={analytics.upcomingAppointments.toLocaleString('ar')}
        />
        <StatCard
          icon={Star}
          label="التقييم"
          value={analytics.averageRating !== null ? `${analytics.averageRating.toFixed(1)} (${analytics.reviewCount})` : '—'}
        />
        <StatCard icon={Wallet} label="الإيرادات" value={formatPrice(analytics.revenue)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأكثر مشاهدة</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.topListings.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات مشاهدات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {analytics.topListings.map((listing, index) => (
                <li key={listing.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-sm text-muted-foreground">{index + 1}</span>
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    {listing.image && (
                      <Image
                        src={getThumbnailUrl(listing.image, 40, 40)}
                        alt={listing.title}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    )}
                  </div>
                  <span className="flex-1 truncate text-sm">{listing.title}</span>
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
