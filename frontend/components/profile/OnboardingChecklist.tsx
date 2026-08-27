'use client';

import Link from 'next/link';
import { Check, Circle, User, Store, PlusCircle, ArrowLeft, Package, Wrench } from 'lucide-react';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useMyAds } from '@/hooks/queries/useAds';
import { useMyStore } from '@/hooks/queries/useStores';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shared/ui/Button';

/**
 * Dashboard onboarding — ads, store catalog, and service provider paths.
 */
export function OnboardingChecklist() {
  const user = useAuthStore(selectUser);
  const { data: sellerProfile, isLoading: sellerLoading, isError: sellerError } = useMySellerProfile();
  const { data: myAds, isLoading: adsLoading } = useMyAds({ limit: 1 });
  const { data: myStore, isSuccess: storeLoaded } = useMyStore();
  const { data: myProvider, isSuccess: providerLoaded } = useMyServiceProvider();

  if (sellerLoading || adsLoading) return null;

  const hasAvatar = Boolean(user?.avatarUrl);
  const hasSellerProfile = !sellerError && Boolean(sellerProfile);
  const hasAd = Boolean(myAds?.items?.length);
  const hasStore = storeLoaded && Boolean(myStore);
  const hasProvider = providerLoaded && Boolean(myProvider);

  const steps = [
    {
      done: hasAvatar,
      label: 'أضف صورة شخصية',
      href: ROUTES.settings.profile,
      icon: User,
    },
    {
      done: hasSellerProfile,
      label: 'أنشئ ملف البائع',
      href: ROUTES.settings.seller,
      icon: Store,
    },
    {
      done: hasAd,
      href: hasSellerProfile
        ? ROUTES.adCreate
        : `${ROUTES.settings.seller}?from=${encodeURIComponent(ROUTES.adCreate)}`,
      label: 'انشر إعلانك الأول (سلعة فردية)',
      icon: PlusCircle,
    },
    {
      done: hasStore,
      href: hasSellerProfile
        ? ROUTES.myStore
        : `${ROUTES.settings.seller}?from=${encodeURIComponent(ROUTES.myStore)}`,
      label: 'افتح متجرك (كتالوج منتجات)',
      icon: Package,
    },
    {
      done: hasProvider,
      href: hasSellerProfile
        ? ROUTES.settings.serviceProvider
        : `${ROUTES.settings.seller}?from=${encodeURIComponent(ROUTES.settings.serviceProvider)}`,
      label: 'سجّل كمزود خدمة (طلبات ومواعيد)',
      icon: Wrench,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;

  const next = remaining[0]!;
  const progress = (doneCount / steps.length) * 100;
  const showPathPicker = hasSellerProfile && !hasAd && !hasStore && !hasProvider;

  return (
    <section
      className="space-y-4 rounded-xl border border-primary/20 bg-card p-4 shadow-sm"
      aria-labelledby="onboarding-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="onboarding-heading" className="text-sm font-semibold">
            ابدأ على سوق غزة
          </h2>
          <p className="text-xs text-muted-foreground">
            {doneCount} من {steps.length} خطوات
            {remaining.length === 1 ? ' — خطوة أخيرة!' : ''}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          {Math.round(progress)}%
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label="تقدم إكمال الملف"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {showPathPicker && (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">اختر مسار العمل:</p>
          <ul className="list-disc ps-4 space-y-1">
            <li>
              <strong className="text-foreground">إعلان:</strong> سلعة واحدة أو مستعمل — نشر سريع.
            </li>
            <li>
              <strong className="text-foreground">متجر:</strong> كتالوج منتجات مستمر مع عروض ومجموعات.
            </li>
            <li>
              <strong className="text-foreground">خدمة:</strong> طلبات عملاء، عروض أسعار، ومواعيد.
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" asChild>
              <Link href={ROUTES.adCreate}>إعلان سريع</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={ROUTES.myStore}>فتح متجر</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={ROUTES.settings.serviceProvider}>مزود خدمة</Link>
            </Button>
          </div>
        </div>
      )}

      <ul className="space-y-1">
        {steps.map((step) => (
          <li key={step.label}>
            {step.done ? (
              <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                <span className="line-through">{step.label}</span>
              </div>
            ) : (
              <Link
                href={step.href}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium transition-colors',
                  step === next ? 'bg-primary/5 text-foreground' : 'hover:bg-muted',
                )}
              >
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <step.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="flex-1 text-start">{step.label}</span>
                {step === next && <ArrowLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <Button asChild className="w-full font-semibold" size="sm">
        <Link href={next.href}>
          {next.label}
          <ArrowLeft className="ms-1 h-4 w-4" aria-hidden />
        </Link>
      </Button>
    </section>
  );
}
