'use client';

import type { ComponentType } from 'react';

/**
 * Provider hub overview — layout aligned with design mockup «خدماتي — نظرة عامة».
 */

import Link from 'next/link';
import {
  ExternalLink,
  Plus,
  Inbox,
  CalendarClock,
  AlertTriangle,
  ListChecks,
  CheckCircle2,
  Settings2,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import {
  useMyServiceProvider,
  useMyServiceProviderAnalytics,
} from '@/hooks/queries/useServiceProviders';
import { useMyServiceListings } from '@/hooks/queries/useServiceListings';
import { BecomeServiceProviderCard } from './BecomeServiceProviderCard';
import { ROUTES } from '@/lib/constants';
import { useAuthStore, selectUser } from '@/store/auth.store';
import type { ParsedError } from '@/lib/errorParser';
import type { ServiceAvailability, ServiceProviderDetails } from '@/types/service.types';
import { formatPrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const AVAIL_LABELS: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

function availDot(status: ServiceAvailability) {
  if (status === 'AVAILABLE') return 'bg-emerald-500';
  if (status === 'BUSY') return 'bg-amber-500';
  return 'bg-muted-foreground';
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</span>
      </div>
      <b className="text-lg font-extrabold tabular-nums leading-none">{value.toLocaleString('ar')}</b>
    </div>
  );
}

function HubBody({ provider }: { provider: ServiceProviderDetails }) {
  const { data: analytics } = useMyServiceProviderAnalytics();
  const { data: listingsData } = useMyServiceListings({ page: 1, limit: 3, status: 'ACTIVE' });
  const currentUser = useAuthStore(selectUser);
  const publicProfileHref = currentUser?.id ? ROUTES.userProfile(currentUser.id) : null;
  const pendingRequests = analytics?.pendingRequests ?? 0;
  const upcomingAppointments = analytics?.upcomingAppointments ?? 0;
  const activeListings = analytics?.activeListings ?? 0;
  const completedRequests = analytics?.completedRequests ?? 0;
  const needsAttention = pendingRequests + upcomingAppointments;
  const initial = (provider.businessName?.trim()?.[0] || 'م').toUpperCase();
  const listingItems = listingsData?.items ?? [];

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm sm:p-4 lg:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-extrabold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-extrabold sm:text-base">{provider.businessName}</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {provider.serviceAreaCities?.length
                ? provider.serviceAreaCities.join('، ')
                : 'مناطق الخدمة غير محددة'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/80 bg-background px-3 text-[13px] font-bold">
            <span className={cn('h-2 w-2 rounded-full', availDot(provider.availabilityStatus))} />
            {AVAIL_LABELS[provider.availabilityStatus]}
          </span>
          {publicProfileHref && (
            <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 rounded-xl font-bold">
              <Link prefetch={false} href={publicProfileHref}>
                البروفايل العام <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button variant="outline" size="icon" asChild className="h-9 w-9 rounded-xl">
            <Link prefetch={false} href={ROUTES.settings.serviceProvider} aria-label="الإعدادات">
              <Settings2 className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {needsAttention > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#F1D3A8] bg-[#FBF0D9] px-3.5 py-3 text-[13px] font-bold text-[#7A4B07]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          لديك {needsAttention.toLocaleString('ar')} عناصر تحتاج إلى متابعة.
        </div>
      )}

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-label="ملخص أداء مقدم الخدمة">
        <StatTile icon={Inbox} label="طلبات معلّقة" value={pendingRequests} />
        <StatTile icon={CalendarClock} label="مواعيد قادمة" value={upcomingAppointments} />
        <StatTile icon={ListChecks} label="خدمات نشطة" value={activeListings} />
        <StatTile icon={CheckCircle2} label="طلبات مكتملة" value={completedRequests} />
      </section>

      {pendingRequests > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-extrabold">يحتاج إلى إجراء</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBF0D9] text-[#7A4B07]">
              <Inbox className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold">طلبات بانتظار ردك</p>
              <p className="text-xs text-muted-foreground">راجع الطلبات وحدد الإجراء المناسب.</p>
            </div>
            <Button size="sm" asChild className="h-9 shrink-0 rounded-xl font-bold">
              <Link prefetch={false} href={ROUTES.incomingServiceRequests}>
                مراجعة
              </Link>
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold">قائمة الخدمات</h2>
          <Button variant="outline" size="sm" asChild className="h-9 gap-1 rounded-xl font-bold">
            <Link href={ROUTES.myServiceCreate}>
              <Plus className="h-3.5 w-3.5" /> خدمة جديدة
            </Link>
          </Button>
        </div>

        {listingItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
            لا توجد خدمات نشطة بعد.
            <div className="mt-3">
              <Button size="sm" asChild className="rounded-xl font-bold">
                <Link href={ROUTES.myServiceCreate}>إضافة خدمة</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {listingItems.map((item) => {
              const priceLabel =
                item.pricingType === 'STARTING_FROM' && item.price != null
                  ? `يبدأ من ${formatPrice(item.price)}`
                  : item.pricingType === 'FIXED' && item.price != null
                    ? `سعر ثابت ${formatPrice(item.price)}`
                    : 'حسب الاتفاق';
              const loc =
                item.serviceLocation === 'AT_CUSTOMER'
                  ? 'لدى العميل'
                  : item.serviceLocation === 'AT_PROVIDER'
                    ? 'لدى مقدم الخدمة'
                    : item.serviceLocation === 'REMOTE'
                      ? 'عن بُعد'
                      : null;
              return (
                <Link
                  key={item.id}
                  href={ROUTES.myServiceEdit(item.id)}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm transition-colors hover:bg-muted/30"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {priceLabel}
                      {loc ? ` · ${loc}` : ''}
                    </p>
                  </div>
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-primary/10 px-2.5 text-[11px] font-bold text-primary">
                    نشطة
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function MyServicesHub() {
  const { data: provider, isLoading, isError, error, refetch } = useMyServiceProvider();

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
        <p>تعذّر تحميل بيانات مقدم الخدمة. يرجى المحاولة مرة أخرى.</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (isError || !provider) {
    return <BecomeServiceProviderCard />;
  }

  return <HubBody provider={provider} />;
}
