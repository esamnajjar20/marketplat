'use client';

import Image from 'next/image';
import { Eye, Users, UserPlus, Package, Tag, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/Card';
import { StatCard } from '@/components/shared/ui/StatCard';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMyStoreAnalytics } from '@/hooks/queries/useStores';
import { getThumbnailUrl } from '@/lib/cloudinary';
import type { ParsedError } from '@/lib/errorParser';

/**
 * STORE-ANALYTICS (Foundation v1): deliberately no orders/revenue/
 * conversion tile — see StoreAnalytics's doc comment
 * (types/store.types.ts) and stores.service.ts's getMyStoreAnalytics
 * on the backend for why: this schema has no Order model yet, so
 * there's no honest number to show. Every tile here reads from data
 * that already existed before this endpoint.
 */
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Eye} label="مشاهدات المتجر" value={analytics.views} />
        <StatCard icon={Users} label="المتابعون" value={analytics.followers} />
        <StatCard icon={UserPlus} label="متابعون جدد (٧ أيام)" value={analytics.newFollowers7d} />
        <StatCard icon={UserPlus} label="متابعون جدد (٣٠ يوم)" value={analytics.newFollowers30d} />
        <StatCard icon={Package} label="منتجات نشطة" value={analytics.activeProducts} />
        <StatCard icon={Tag} label="عروض نشطة" value={analytics.activePromotions} />
        <StatCard icon={TrendingUp} label="استخدامات العروض" value={analytics.promotionUses} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأكثر مشاهدة</CardTitle>
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
                      <Image
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
                    {product.views.toLocaleString('ar')} مشاهدة
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
