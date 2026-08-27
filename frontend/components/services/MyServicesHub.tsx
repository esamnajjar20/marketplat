'use client';

/**
 * Service provider operating hub — KPIs, availability, quick actions.
 * List of listings remains on the same page below this component.
 */

import Link from 'next/link';
import {
  Wrench,
  ExternalLink,
  Plus,
  Inbox,
  CalendarClock,
  BarChart3,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import {
  useMyServiceProvider,
  useMyServiceProviderAnalytics,
} from '@/hooks/queries/useServiceProviders';
import { BecomeServiceProviderCard } from './BecomeServiceProviderCard';
import { ROUTES } from '@/lib/constants';
import { formatNumber } from '@/lib/formatters';
import { useAuthStore, selectUser } from '@/store/auth.store';
import type { ParsedError } from '@/lib/errorParser';
import type { ServiceAvailability, ServiceProviderDetails } from '@/types/service.types';

const AVAIL_LABELS: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

const AVAIL_VARIANT: Record<ServiceAvailability, 'default' | 'secondary' | 'destructive'> = {
  AVAILABLE: 'default',
  BUSY: 'secondary',
  UNAVAILABLE: 'destructive',
};

function KpiCard({
  label,
  value,
  href,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border bg-card p-4 space-y-2 transition-colors hover:bg-muted/50 ${
        highlight ? 'border-primary/30 bg-primary/5' : ''
      }`}
    >
      <Icon className="h-4 w-4 text-primary" />
      <p className="text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function HubBody({ provider }: { provider: ServiceProviderDetails }) {
  const { data: analytics, isLoading: analyticsLoading } = useMyServiceProviderAnalytics();
  const currentUser = useAuthStore(selectUser);
  const publicProfileHref = currentUser?.id ? ROUTES.userProfile(currentUser.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-xl font-bold truncate">{provider.businessName}</h1>
            <Badge variant={AVAIL_VARIANT[provider.availabilityStatus]}>
              {AVAIL_LABELS[provider.availabilityStatus]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {provider.serviceAreaCities?.length
              ? provider.serviceAreaCities.join(' · ')
              : 'مناطق الخدمة غير محددة'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {publicProfileHref && (
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={publicProfileHref}>
                البروفايل العام <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href={ROUTES.settings.serviceProvider}>الإعدادات</Link>
          </Button>
        </div>
      </div>

      {analyticsLoading ? (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      ) : analytics ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            label="مشاهدات الخدمات"
            value={analytics.totalViews}
            href={ROUTES.myServiceProviderAnalytics}
            icon={Eye}
          />
          <KpiCard
            label="خدمات نشطة"
            value={analytics.activeListings}
            href={ROUTES.myServices}
            icon={Wrench}
          />
          <KpiCard
            label="طلبات معلّقة"
            value={analytics.pendingRequests}
            href={ROUTES.incomingServiceRequests}
            icon={Inbox}
            highlight={analytics.pendingRequests > 0}
          />
          <KpiCard
            label="مواعيد قادمة"
            value={analytics.upcomingAppointments}
            href={ROUTES.myServiceAppointments}
            icon={CalendarClock}
            highlight={analytics.upcomingAppointments > 0}
          />
          <KpiCard
            label="طلبات مكتملة"
            value={analytics.completedRequests}
            href={ROUTES.myServiceProviderAnalytics}
            icon={BarChart3}
          />
        </div>
      ) : null}

      {analytics && analytics.pendingRequests > 0 && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm flex flex-wrap gap-2 items-center">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <Link href={ROUTES.incomingServiceRequests} className="text-primary hover:underline">
            {analytics.pendingRequests} طلب بانتظار ردك
          </Link>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">إجراءات سريعة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button asChild className="h-auto flex-col gap-1 py-3 font-semibold">
            <Link href={ROUTES.myServiceCreate}>
              <Plus className="h-4 w-4" />
              خدمة جديدة
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.incomingServiceRequests}>
              <Inbox className="h-4 w-4" />
              الطلبات الواردة
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myServiceAppointments}>
              <CalendarClock className="h-4 w-4" />
              المواعيد
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
            <Link href={ROUTES.myServiceProviderAnalytics}>
              <BarChart3 className="h-4 w-4" />
              الإحصائيات
            </Link>
          </Button>
        </div>
      </section>

      {analytics && analytics.topListings.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">الأكثر مشاهدة</h2>
            <Link
              href={ROUTES.myServiceProviderAnalytics}
              className="text-xs text-primary hover:underline"
            >
              الكل
            </Link>
          </div>
          <ul className="space-y-2 rounded-lg border divide-y">
            {analytics.topListings.slice(0, 5).map((item, i) => {
              const maxViews = analytics.topListings[0]?.views || 1;
              const pct = Math.max(8, Math.round((item.views / maxViews) * 100));
              return (
                <li key={item.id} className="px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">
                      <span className="text-muted-foreground me-2">{i + 1}.</span>
                      {item.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {formatNumber(item.views)} مشاهدة
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
        <p>تعذّر تحميل بيانات مزود الخدمة. يرجى المحاولة مرة أخرى.</p>
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
