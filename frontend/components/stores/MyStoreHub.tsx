'use client';

/**
 * Store owner operating hub — KPIs, status, quick actions.
 * Profile/settings form lives at /my-store/settings (MyStoreCard).
 */

import Link from 'next/link';
import {
  Store,
  ExternalLink,
  PackagePlus,
  Package,
  BarChart3,
  Tag,
  Layers,
  Settings2,
  Eye,
  Users,
  AlertTriangle,
  Clock,
  Ban,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyStore, useMyStoreAnalytics } from '@/hooks/queries/useStores';
import { useMyAttention } from '@/hooks/queries/useSellers';
import { STORE_STATUS_LABELS, STORE_STATUS_VARIANT } from '@/lib/storeStatus';
import { ROUTES } from '@/lib/constants';
import { formatNumber } from '@/lib/formatters';
import { BecomeStoreOwnerCard } from './BecomeStoreOwnerCard';
import { useRequestStoreFeature } from '@/hooks/mutations/useStoreMutations';
import type { ParsedError } from '@/lib/errorParser';
import type { StoreDetails } from '@/types/store.types';

function StatusBanner({ store }: { store: StoreDetails }) {
  if (store.status === 'ACTIVE') return null;

  if (store.status === 'PENDING') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <Clock className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">متجرك قيد المراجعة</p>
          <p className="text-muted-foreground">
            لن يظهر للزوار في دليل المتاجر حتى توافق الإدارة. يمكنك تجهيز المنتجات والعروض الآن.
          </p>
        </div>
      </div>
    );
  }

  if (store.status === 'BLOCKED') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <Ban className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-destructive">تم حظر متجرك</p>
          <p className="text-muted-foreground">تواصل مع الدعم لمزيد من التفاصيل.</p>
        </div>
      </div>
    );
  }

  return null;
}

function KpiCard({
  label,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border bg-card p-4 space-y-2 transition-colors hover:bg-muted/50"
    >
      <Icon className="h-4 w-4 text-primary" />
      <p className="text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}


function FeatureRequestCard({ requested }: { requested: boolean }) {
  const requestFeature = useRequestStoreFeature();
  if (requested) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0" />
        <span>طلب تمييز المتجر قيد مراجعة الإدارة</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 space-y-0.5">
        <p className="font-semibold flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" /> ميّز متجرك
        </p>
        <p className="text-xs text-muted-foreground">
          الظهور أعلى في دليل المتاجر. الطلب يُراجع من الإدارة (بدون دفع تلقائي في هذه المرحلة).
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={requestFeature.isPending}
        onClick={() => requestFeature.mutate()}
      >
        {requestFeature.isPending ? 'جارٍ الإرسال…' : 'طلب التمييز'}
      </Button>
    </div>
  );
}

function HubBody({ store }: { store: StoreDetails }) {
  const { data: analytics, isLoading: analyticsLoading } = useMyStoreAnalytics();
  const { data: attention } = useMyAttention();

  return (
    <div className="space-y-6">
      <StatusBanner store={store} />

      {store.status === 'ACTIVE' && store.plan !== 'FEATURED' && (
        <FeatureRequestCard requested={Boolean(store.featureRequestedAt)} />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Store className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-xl font-bold truncate">{store.name}</h1>
            <Badge variant={STORE_STATUS_VARIANT[store.status]}>
              {STORE_STATUS_LABELS[store.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{store.city}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {store.status === 'ACTIVE' && (
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={ROUTES.storeDetail(store.id)}>
                عرض الصفحة العامة <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={ROUTES.myStoreSettings}>
              <Settings2 className="h-3.5 w-3.5" /> الإعدادات
            </Link>
          </Button>
        </div>
      </div>

      {analyticsLoading ? (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="مشاهدات المتجر" value={analytics.views} href={ROUTES.myStoreAnalytics} icon={Eye} />
          <KpiCard label="المتابعون" value={analytics.followers} href={ROUTES.myStoreAnalytics} icon={Users} />
          <KpiCard label="منتجات نشطة" value={analytics.activeProducts} href={ROUTES.myStoreProducts} icon={Package} />
          <KpiCard label="عروض نشطة" value={analytics.activePromotions} href={ROUTES.myStorePromotions} icon={Tag} />
          <KpiCard
            label="متابعون جدد (٣٠ يوم)"
            value={analytics.newFollowers30d}
            href={ROUTES.myStoreAnalytics}
            icon={Users}
          />
        </div>
      ) : null}

      {(attention?.productsOutOfStock || attention?.productsMissingImages) ? (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm flex flex-wrap gap-3 items-center">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          {attention.productsOutOfStock > 0 && (
            <Link href={`${ROUTES.myStoreProducts}?availability=OUT_OF_STOCK`} className="text-primary hover:underline">
              {attention.productsOutOfStock} منتج غير متوفر
            </Link>
          )}
          {attention.productsMissingImages > 0 && (
            <Link href={ROUTES.myStoreProducts} className="text-primary hover:underline">
              {attention.productsMissingImages} منتج بدون صور
            </Link>
          )}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <Button asChild className="h-auto flex-col gap-1 py-3 font-semibold">
            <Link href={ROUTES.myStoreProductCreate}>
              <PackagePlus className="h-4 w-4" />
              إضافة منتج
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStoreProducts}>
              <Package className="h-4 w-4" />
              منتجاتي
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStorePromotions}>
              <Tag className="h-4 w-4" />
              العروض
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStoreCollections}>
              <Layers className="h-4 w-4" />
              المجموعات
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStoreAnalytics}>
              <BarChart3 className="h-4 w-4" />
              الإحصائيات
            </Link>
          </Button>
        </div>
      </section>

      {analytics && analytics.topProducts.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">الأكثر مشاهدة</h2>
            <Link href={ROUTES.myStoreAnalytics} className="text-xs text-primary hover:underline">
              الكل
            </Link>
          </div>
          <ul className="space-y-2 rounded-lg border divide-y">
            {analytics.topProducts.slice(0, 5).map((p, i) => {
              const maxViews = analytics.topProducts[0]?.views || 1;
              const pct = Math.max(8, Math.round((p.views / maxViews) * 100));
              return (
                <li key={p.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">
                      <span className="text-muted-foreground me-2">{i + 1}.</span>
                      {p.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {formatNumber(p.views)} مشاهدة
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export function MyStoreHub() {
  const { data: store, isLoading, isError, error, refetch } = useMyStore();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const statusCode = (error as ParsedError | null)?.statusCode;

  if (isError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات المتجر. يرجى المحاولة مرة أخرى.</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (isError || !store) {
    return <BecomeStoreOwnerCard />;
  }

  return <HubBody store={store} />;
}

