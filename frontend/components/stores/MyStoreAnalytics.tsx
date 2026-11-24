'use client';

import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Eye, Users, UserPlus, Package, Tag, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/Card';
import { StatCard } from '@/components/shared/ui/StatCard';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMyStoreAnalytics } from '@/hooks/queries/useStores';
import { getThumbnailUrl } from '@/lib/cloudinary';
import type { ParsedError } from '@/lib/errorParser';
import { formatNumber } from '@/lib/formatters';

/** Store checkout orders are reported separately from the seller's SaleRecord ledger. */
export function MyStoreAnalytics() {
  const { data: analytics, isLoading, isError, error, refetch } = useMyStoreAnalytics();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // Same "404 means no store yet" convention useMyStore's own callers
  // already follow — StoreSettingsSection's BecomeStoreOwnerCard is the
  // canonical entry point for that state, so this page just points
  // there rather than duplicating the CTA.
  const statusCode = (error as ParsedError | null)?.statusCode;
  if (isError && statusCode === 404) {
    return (
      <EmptyState
        icon={<Package className="h-8 w-8" />}
        title="لا يوجد متجر بعد"
        description="افتح متجرك أولاً لترى إحصائياته هنا."
      />
    );
  }

  if (isError || !analytics) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل إحصائيات المتجر. يرجى المحاولة مرة أخرى.</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3 lg:gap-4">
        <StatCard icon={Eye} label="مشاهدات المتجر" value={analytics.views} />
        <StatCard icon={Users} label="المتابعون" value={analytics.followers} />
        <StatCard icon={UserPlus} label="متابعون جدد (٧ أيام)" value={analytics.newFollowers7d} />
        <StatCard icon={UserPlus} label="متابعون جدد (٣٠ يوم)" value={analytics.newFollowers30d} />
        <StatCard icon={Package} label="منتجات نشطة" value={analytics.activeProducts} />
        <StatCard icon={Tag} label="عروض نشطة" value={analytics.activePromotions} />
        <StatCard icon={TrendingUp} label="استخدامات العروض" value={analytics.promotionUses} />
        <StatCard icon={Package} label="طلبات المتجر · كل الفترة" value={analytics.orders?.totalCount ?? '—'} />
      </div>

      {analytics.orders ? <Card>
        <CardHeader>
          <CardTitle className="text-base">حالات طلبات المتجر · كل الفترة</CardTitle>
          <p className="text-xs text-muted-foreground">هذه طلبات شراء عبر المتجر، وليست سجلات المبيعات اليدوية. القيم المعروضة ليست مبالغ محصّلة.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {([
              ['قيد الانتظار', analytics.orders.byStatus?.PENDING ?? 0],
              ['مؤكدة', analytics.orders.byStatus?.CONFIRMED ?? 0],
              ['قيد التجهيز', analytics.orders.byStatus?.PROCESSING ?? 0],
              ['تم الشحن', analytics.orders.byStatus?.SHIPPED ?? 0],
              ['تم التسليم', analytics.orders.byStatus?.DELIVERED ?? 0],
              ['ملغاة', analytics.orders.byStatus?.CANCELLED ?? 0],
            ] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xl font-bold tabular-nums">{formatNumber(value)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm font-semibold">قيمة الطلبات غير الملغاة حسب العملة</p>
            {analytics.orders.nonCancelledValueByCurrency?.length ? analytics.orders.nonCancelledValueByCurrency.map((row) => (
              <p key={row.currency} className="text-sm tabular-nums">{row.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.currency}</p>
            )) : <p className="text-sm text-muted-foreground">لا توجد طلبات بعد.</p>}
            <p className="pt-1 text-sm font-semibold">قيمة الطلبات المسلّمة حسب العملة</p>
            {analytics.orders.deliveredValueByCurrency?.length ? analytics.orders.deliveredValueByCurrency.map((row) => (
              <p key={row.currency} className="text-sm tabular-nums">{row.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.currency}</p>
            )) : <p className="text-sm text-muted-foreground">لا توجد طلبات مسلّمة بعد.</p>}
          </div>
        </CardContent>
      </Card> : <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">مؤشرات طلبات الشراء غير متاحة من إصدار الخادم الحالي.</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأكثر مشاهدة · كل الفترة</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات مشاهدات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {analytics.topProducts.map((product, index) => {
                const maxViews = analytics.topProducts[0]?.views || 1;
                const pct = Math.max(8, Math.round((product.views / maxViews) * 100));
                return (
                <li key={product.id} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-sm text-muted-foreground">{index + 1}</span>
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                    {product.image && (
                      <SafeImage
                        src={getThumbnailUrl(product.image, 40, 40)}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    )}
                  </div>
                  <span className="flex-1 truncate text-sm">{product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatNumber(product.views)} مشاهدة
                  </span>
                  </div>
                  <div className="ms-7 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );})}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
