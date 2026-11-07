'use client';


import type { ComponentType } from 'react';
/**
 * Store operating hub — status, attention, quick actions.
 * Layout aligned with design mockup «لوحة متجري — نظرة عامة».
 */

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import {
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
  ImageIcon,
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
import { cn } from '@/lib/utils';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';

function StatusBanner({ store }: { store: StoreDetails }) {
  if (store.status === 'ACTIVE') return null;

  if (store.status === 'PENDING') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[var(--legacy-warning-soft-strong)] bg-[var(--legacy-warning-soft)] p-3.5 text-sm text-[var(--legacy-warning-text)]">
        <Clock className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-bold">متجرك قيد المراجعة</p>
          <p className="text-[13px] leading-relaxed opacity-90">
            لن يظهر للزوار في دليل المتاجر حتى توافق الإدارة. يمكنك تجهيز المنتجات والعروض الآن.
          </p>
        </div>
      </div>
    );
  }

  if (store.status === 'BLOCKED') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm">
        <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-0.5">
          <p className="font-bold text-destructive">تم حظر متجرك</p>
          <p className="text-muted-foreground">تواصل مع الدعم لمزيد من التفاصيل.</p>
        </div>
      </div>
    );
  }

  return null;
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <IntentPrefetchLink
      prefetch={false}
      href={href}
      className="flex h-11 items-center gap-2 rounded-xl border border-border/80 bg-card px-3 text-[13px] font-bold text-foreground shadow-sm transition-colors hover:bg-muted/40"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      {label}
    </IntentPrefetchLink>
  );
}

function HubBody({ store }: { store: StoreDetails }) {
  const storeLabels = getStoreTypeLabels(store.storeType);
  const { data: attention } = useMyAttention();
  const requestFeature = useRequestStoreFeature();
  const featurePending = Boolean(store.featureRequestedAt);
  const storeTypeLabel = store.storeType?.nameAr || 'متجر';
  const initial = (store.name?.trim()?.[0] || 'م').toUpperCase();
  const avatar = getAvatarUrl(store.logoUrl ?? '', 96);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 720) : null;

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <StatusBanner store={store} />

      {/* Store identity card — matches mockup cover + logo */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm sm:p-3">
        <div className="relative h-16 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--legacy-primary-deep)] via-[var(--legacy-primary)] to-[var(--legacy-primary-mid)]">
          {cover ? (
            <SafeImage src={cover} alt="" fill className="object-cover" sizes="400px" />
          ) : null}
        </div>

        <div className="-mt-5 flex items-end justify-between px-1">
          <div className="relative flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border-[3px] border-card bg-primary/10 text-lg font-extrabold text-primary">
            {store.logoUrl ? (
              <SafeImage variant="avatar" src={avatar} alt={store.name} fill className="object-cover" sizes="52px" />
            ) : (
              <span aria-hidden>{initial}</span>
            )}
          </div>
        </div>

        <div className="mt-2 space-y-2 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold">{store.name}</h2>
            <Badge
              variant={STORE_STATUS_VARIANT[store.status]}
              className={cn(
                store.status === 'PENDING' && 'border-0 bg-[var(--legacy-accent-soft)] text-[var(--legacy-accent)]',
              )}
            >
              {STORE_STATUS_LABELS[store.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {[storeTypeLabel, store.city].filter(Boolean).join(' · ')}
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {store.status === 'ACTIVE' && (
              <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 rounded-xl font-bold">
                <IntentPrefetchLink href={ROUTES.storeDetail(store.id)} prefetch={false}>
                  عرض الصفحة العامة <ExternalLink className="h-3.5 w-3.5" />
                </IntentPrefetchLink>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 rounded-xl font-bold">
              <IntentPrefetchLink prefetch={false} href={ROUTES.myStoreAnalytics}>
                <BarChart3 className="h-3.5 w-3.5" /> الإحصائيات
              </IntentPrefetchLink>
            </Button>
            <Button variant="outline" size="icon" asChild className="h-9 w-9 rounded-xl">
              <IntentPrefetchLink prefetch={false} href={ROUTES.myStoreSettings} aria-label="الإعدادات">
                <Settings2 className="h-4 w-4" />
              </IntentPrefetchLink>
            </Button>
          </div>
        </div>
      </div>

      {/* Needs attention */}
      {(attention?.productsOutOfStock || attention?.productsMissingImages) ? (
        <section className="space-y-2.5">
          <h2 className="text-sm font-extrabold">يحتاج انتباهك</h2>
          {attention.productsOutOfStock > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--legacy-danger-soft)] text-[var(--legacy-danger)]">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1 text-[13px] font-bold">
                {attention.productsOutOfStock} {storeLabels.product} غير متوفر
              </p>
              <Button variant="outline" size="sm" asChild className="h-9 shrink-0 rounded-xl font-bold">
                <IntentPrefetchLink
                  prefetch={false}
                  href={myStoreTabHref('products', { availability: 'OUT_OF_STOCK' })}
                >
                  مراجعة
                </IntentPrefetchLink>
              </Button>
            </div>
          )}
          {attention.productsMissingImages > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--legacy-warning-soft)] text-[var(--legacy-warning-text)]">
                <ImageIcon className="h-4 w-4" />
              </span>
              <p className="min-w-0 flex-1 text-[13px] font-bold">
                {attention.productsMissingImages} {storeLabels.product} بدون صور
              </p>
              <Button variant="outline" size="sm" asChild className="h-9 shrink-0 rounded-xl font-bold">
                <IntentPrefetchLink prefetch={false} href={ROUTES.myStoreProducts}>
                  إضافة صور
                </IntentPrefetchLink>
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {/* Quick actions */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-extrabold">إجراءات سريعة</h2>
        <Button asChild className="h-11 w-full rounded-xl text-sm font-bold shadow-md shadow-primary/25">
          <IntentPrefetchLink prefetch={false} href={ROUTES.myStoreProductCreate}>
            <PackagePlus className="h-4 w-4" />
            {storeLabels.addProduct}
          </IntentPrefetchLink>
        </Button>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <QuickAction href={ROUTES.myStoreInventory} icon={Package} label="المخزون" />
          <QuickAction href={ROUTES.myStoreMembers} icon={Users} label="الأعضاء" />
          <QuickAction href={ROUTES.myStorePromotions} icon={Tag} label="العروض" />
          <QuickAction href={ROUTES.myStoreCollections} icon={Layers} label="المجموعات" />
        </div>
      </section>

      {/* Feature CTA */}
      {store.status === 'ACTIVE' && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--legacy-accent-border)] bg-[var(--legacy-accent-soft)] p-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--legacy-accent)]">ميّز متجرك في الدليل</p>
            <p className="text-xs text-[var(--legacy-accent-deep)]">
              {featurePending ? 'طلب التمييز قيد المراجعة.' : 'لزيادة الظهور أمام الزوار.'}
            </p>
          </div>
          <Button
            size="sm"
            className="h-9 shrink-0 rounded-xl bg-[var(--legacy-accent-strong)] font-bold text-accent-foreground hover:bg-[var(--legacy-accent)]"
            disabled={featurePending || requestFeature.isPending}
            onClick={() => requestFeature.mutate()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {featurePending ? 'تم الطلب' : 'اطلب التمييز'}
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
