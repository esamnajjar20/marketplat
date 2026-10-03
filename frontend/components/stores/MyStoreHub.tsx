'use client';

/**
 * Store operating hub — status, attention, quick actions.
 * Full metrics live only on /my-store/analytics (MyStoreAnalytics).
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
  AlertTriangle,
  Clock,
  Ban,
  Sparkles,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyStore } from '@/hooks/queries/useStores';
import { useMyAttention } from '@/hooks/queries/useSellers';
import { STORE_STATUS_LABELS, STORE_STATUS_VARIANT } from '@/lib/storeStatus';
import { ROUTES } from '@/lib/constants';
import { myStoreTabHref } from '@/lib/myStoreHubTabs';
import { BecomeStoreOwnerCard } from './BecomeStoreOwnerCard';
import { useRequestStoreFeature } from '@/hooks/mutations/useStoreMutations';
import type { ParsedError } from '@/lib/errorParser';
import { getStoreTypeLabels, type StoreDetails } from '@/types/store.types';

function StatusBanner({ store }: { store: StoreDetails }) {
  if (store.status === 'ACTIVE') return null;

  if (store.status === 'PENDING') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <Clock className="h-5 w-5 shrink-0 text-warning dark:text-warning mt-0.5" />
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

function HubBody({ store }: { store: StoreDetails }) {
  const storeLabels = getStoreTypeLabels(store.storeType);
  const { data: attention } = useMyAttention();
  const requestFeature = useRequestStoreFeature();
  const featurePending = Boolean(store.featureRequestedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Store className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-xl font-bold truncate">{store.name}</h1>
            <Badge variant={STORE_STATUS_VARIANT[store.status]}>{STORE_STATUS_LABELS[store.status]}</Badge>
          </div>
          {store.city && <p className="text-sm text-muted-foreground">{store.city}</p>}
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
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={ROUTES.myStoreAnalytics}>
              <BarChart3 className="h-3.5 w-3.5" /> الإحصائيات
            </Link>
          </Button>
        </div>
      </div>

      <StatusBanner store={store} />

      {(attention?.productsOutOfStock || attention?.productsMissingImages) ? (
        <div className="rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm flex flex-wrap gap-3 items-center">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          {attention.productsOutOfStock > 0 && (
            <Link
              href={myStoreTabHref('products', { availability: 'OUT_OF_STOCK' })}
              className="text-primary hover:underline"
            >
              {attention.productsOutOfStock} {storeLabels.product} غير متوفر
            </Link>
          )}
          {attention.productsMissingImages > 0 && (
            <Link href={ROUTES.myStoreProducts} className="text-primary hover:underline">
              {attention.productsMissingImages} {storeLabels.product} بدون صور
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
              {storeLabels.addProduct}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStoreProducts}>
              <Package className="h-4 w-4" />
              {storeLabels.products}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStoreInventory}>
              <Package className="h-4 w-4" />
              المخزون
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myStoreMembers}>
              <Users className="h-4 w-4" />
              الأعضاء
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
        </div>
      </section>

      {store.status === 'ACTIVE' && (
        <div className="rounded-lg border p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">
            {featurePending
              ? 'طلب التمييز قيد المراجعة'
              : 'ميّز متجرك في الدليل لزيادة الظهور'}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={featurePending || requestFeature.isPending}
            onClick={() => requestFeature.mutate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {featurePending ? 'تم الطلب' : 'طلب تمييز'}
          </Button>
        </div>
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
