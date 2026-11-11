'use client';

import type { ComponentType } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Provider hub overview — layout aligned with design mockup «خدماتي — نظرة عامة».
 */

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import {
  ExternalLink,
  Inbox,
  CalendarClock,
  AlertTriangle,
  ListChecks,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyServiceProvider, useMyServiceProviderDashboard } from '@/hooks/queries/useServiceProviders';
import { BecomeServiceProviderCard } from './BecomeServiceProviderCard';
import { ROUTES } from '@/lib/constants';
import { useAuthStore, selectUser } from '@/store/auth.store';
import type { ParsedError } from '@/lib/errorParser';
import type { ServiceProviderDetails } from '@/types/service.types';
import { AVAILABILITY_LABEL, AVAILABILITY_DOT } from '@/lib/serviceAvailability';
import type { ServiceProviderDashboardData } from '@/api/service-providers.api';
import { myServicesWorkspaceParamsFromSearchParams } from '@/lib/myServicesWorkspace';
import { cn } from '@/lib/utils';

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-2xs-tight font-medium leading-tight text-muted-foreground">{label}</span>
      </div>
      <b className="text-lg font-extrabold tabular-nums leading-none">{typeof value === 'number' ? value.toLocaleString('ar') : value}</b>
    </div>
  );
}

function HubBody({
  provider,
  analytics,
}: {
  provider: ServiceProviderDetails;
  analytics: ServiceProviderDashboardData['analytics'] | null;
}) {
  const currentUser = useAuthStore(selectUser);
  const publicProfileHref = currentUser?.id ? ROUTES.userProfile(currentUser.id) : null;
  const pendingRequests = analytics?.pendingRequests ?? 0;
  const upcomingAppointments = analytics?.upcomingAppointments ?? 0;
  const activeListings = analytics?.activeListings ?? 0;
  const completedRequests = analytics?.completedRequests ?? 0;
  const needsAttention = pendingRequests + upcomingAppointments;
  const hasAnalytics = analytics !== null;
  const initial = (provider.businessName?.trim()?.[0] || 'م').toUpperCase();

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm sm:p-4 lg:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-extrabold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-card-title font-extrabold sm:text-base">{provider.businessName}</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {provider.serviceAreaCities?.length
                ? provider.serviceAreaCities.join('، ')
                : 'مناطق الخدمة غير محددة'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/80 bg-background px-3 text-sm-tight font-bold">
            <span className={cn('h-2 w-2 rounded-full', AVAILABILITY_DOT[provider.availabilityStatus])} />
            {AVAILABILITY_LABEL[provider.availabilityStatus]}
          </span>
          {publicProfileHref && (
            <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 rounded-xl font-bold">
              <IntentPrefetchLink prefetch={false} href={publicProfileHref}>
                البروفايل العام <ExternalLink className="h-3.5 w-3.5" />
              </IntentPrefetchLink>
            </Button>
          )}
          <Button variant="outline" size="icon" asChild className="h-9 w-9 rounded-xl">
            <IntentPrefetchLink prefetch={false} href={ROUTES.settings.serviceProvider} aria-label="الإعدادات">
              <Settings2 className="h-4 w-4" />
            </IntentPrefetchLink>
          </Button>
        </div>
      </section>

      {hasAnalytics && needsAttention > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--legacy-warning-soft-strong)] bg-[var(--legacy-warning-soft)] px-3.5 py-3 text-sm-tight font-bold text-[var(--legacy-warning-text)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          لديك {needsAttention.toLocaleString('ar')} عناصر تحتاج إلى متابعة.
        </div>
      )}

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-label="ملخص أداء مقدم الخدمة">
        <StatTile icon={Inbox} label="طلبات معلّقة" value={hasAnalytics ? pendingRequests : '—'} />
        <StatTile icon={CalendarClock} label="مواعيد قادمة" value={hasAnalytics ? upcomingAppointments : '—'} />
        <StatTile icon={ListChecks} label="خدمات نشطة" value={hasAnalytics ? activeListings : '—'} />
        <StatTile icon={CheckCircle2} label="طلبات مكتملة" value={hasAnalytics ? completedRequests : '—'} />
      </section>

      {hasAnalytics && pendingRequests > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-extrabold">يحتاج إلى إجراء</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--legacy-warning-soft)] text-[var(--legacy-warning-text)]">
              <Inbox className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm-tight font-bold">طلبات بانتظار ردك</p>
              <p className="text-xs text-muted-foreground">راجع الطلبات وحدد الإجراء المناسب.</p>
            </div>
            <Button size="sm" asChild className="h-9 shrink-0 rounded-xl font-bold">
              <IntentPrefetchLink prefetch={false} href={ROUTES.incomingServiceRequests}>
                مراجعة
              </IntentPrefetchLink>
            </Button>
          </div>
        </section>
      )}

    </div>
  );
}

export function MyServicesHub() {
  const searchParams = useSearchParams();
  const workspaceParams = myServicesWorkspaceParamsFromSearchParams(searchParams);
  // Provider identity is already included in authenticated bootstrap and is
  // shared with the list component via the same query key.
  const providerQuery = useMyServiceProvider();
  const provider = providerQuery.data;
  const dashboardQuery = useMyServiceProviderDashboard(workspaceParams, { enabled: Boolean(provider) });
  const { data: dashboard, isLoading: dashboardLoading, isError, error, refetch } = dashboardQuery;
  const isLoading = providerQuery.isLoading || (Boolean(provider) && dashboardLoading);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const providerStatusCode = (providerQuery.error as ParsedError | null)?.statusCode;
  const statusCode = (error as ParsedError | null)?.statusCode;

  if (providerQuery.isError && providerStatusCode === 404) {
    return <BecomeServiceProviderCard />;
  }

  if (providerQuery.isError || (isError && statusCode !== 404)) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات مقدم الخدمة. يرجى المحاولة مرة أخرى.</p>
        <button type="button" onClick={() => { void providerQuery.refetch(); void refetch(); }} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!provider) {
    return <BecomeServiceProviderCard />;
  }

  return <HubBody provider={provider} analytics={dashboard?.analytics ?? null} />;
}
