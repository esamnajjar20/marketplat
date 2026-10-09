'use client';

import Link from 'next/link';
import {
  Wrench, ExternalLink, Plus, Inbox, CalendarClock, BarChart3,
  AlertTriangle, Radio, ListChecks, CheckCircle2, Clock3,
} from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/ui/Card';
import { StatCard } from '@/components/shared/ui/StatCard';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import {
  useMyServiceProvider,
  useMyServiceProviderAnalytics,
} from '@/hooks/queries/useServiceProviders';
import { BecomeServiceProviderCard } from './BecomeServiceProviderCard';
import { ROUTES } from '@/lib/constants';
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

function HubBody({ provider }: { provider: ServiceProviderDetails }) {
  const { data: analytics } = useMyServiceProviderAnalytics();
  const currentUser = useAuthStore(selectUser);
  const publicProfileHref = currentUser?.id ? ROUTES.userProfile(currentUser.id) : null;
  const pendingRequests = analytics?.pendingRequests ?? 0;
  const upcomingAppointments = analytics?.upcomingAppointments ?? 0;
  const activeListings = analytics?.activeListings ?? 0;
  const completedRequests = analytics?.completedRequests ?? 0;
  const needsAttention = pendingRequests + upcomingAppointments;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Wrench className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <h2 className="truncate text-xl font-bold">{provider.businessName}</h2>
              <Badge variant={AVAIL_VARIANT[provider.availabilityStatus]}>
                {AVAIL_LABELS[provider.availabilityStatus]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {provider.serviceAreaCities?.length
                ? provider.serviceAreaCities.join(' · ')
                : 'مناطق الخدمة غير محددة'}
            </p>
            <p className="text-sm text-muted-foreground">
              {needsAttention > 0
                ? `لديك ${needsAttention} عنصر${needsAttention === 1 ? '' : 'اً'} يحتاج إلى متابعة.`
                : 'لا توجد إجراءات عاجلة الآن. يمكنك متابعة خدماتك ومواعيدك.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicProfileHref && (
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <Link prefetch={false} href={publicProfileHref}>
                  البروفايل العام <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link prefetch={false} href={ROUTES.settings.serviceProvider}>الإعدادات</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="ملخص أداء مقدم الخدمة">
        <StatCard icon={Inbox} label="طلبات معلقة" value={pendingRequests.toLocaleString('ar')} />
        <StatCard icon={CalendarClock} label="مواعيد قادمة" value={upcomingAppointments.toLocaleString('ar')} />
        <StatCard icon={ListChecks} label="خدمات نشطة" value={activeListings.toLocaleString('ar')} />
        <StatCard icon={CheckCircle2} label="طلبات مكتملة" value={completedRequests.toLocaleString('ar')} />
      </section>

      {needsAttention > 0 ? (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" aria-hidden />
              يحتاج إلى إجراء
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {pendingRequests > 0 && (
              <Link
                href={ROUTES.incomingServiceRequests}
                className="group rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Inbox className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="font-medium">طلبات بانتظار ردك</span>
                  </div>
                  <Badge>{pendingRequests.toLocaleString('ar')}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">راجع الطلبات وحدد الإجراء المناسب.</p>
              </Link>
            )}
            {upcomingAppointments > 0 && (
              <Link
                href={ROUTES.myServiceAppointments}
                className="group rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="font-medium">مواعيد قادمة</span>
                  </div>
                  <Badge>{upcomingAppointments.toLocaleString('ar')}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">راجع جدولك قبل بدء المواعيد.</p>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">إجراءات سريعة</h2>
            <p className="text-xs text-muted-foreground">أهم العمليات التي تستخدمها لإدارة عملك.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Button asChild className="h-auto min-h-20 flex-col gap-1.5 py-3 font-semibold">
            <Link href={ROUTES.myServiceCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              خدمة جديدة
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-1.5 py-3">
            <Link prefetch={false} href={ROUTES.incomingServiceRequests}>
              <Inbox className="h-4 w-4" aria-hidden />
              الطلبات الواردة
              {pendingRequests > 0 && <Badge variant="secondary">{pendingRequests.toLocaleString('ar')}</Badge>}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-1.5 py-3">
            <Link prefetch={false} href={ROUTES.myServiceAppointments}>
              <CalendarClock className="h-4 w-4" aria-hidden />
              المواعيد
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-1.5 py-3">
            <Link prefetch={false} href={ROUTES.requests}>
              <Radio className="h-4 w-4" aria-hidden />
              الطلبات المفتوحة
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto min-h-20 flex-col gap-1.5 py-3">
            <Link prefetch={false} href={ROUTES.myServiceProviderAnalytics}>
              <BarChart3 className="h-4 w-4" aria-hidden />
              الإحصائيات
            </Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden />
            حالة العمل
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
            <span className="text-muted-foreground">حالة الظهور</span>
            <Badge variant={AVAIL_VARIANT[provider.availabilityStatus]}>
              {AVAIL_LABELS[provider.availabilityStatus]}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
            <span className="text-muted-foreground">الخدمات النشطة</span>
            <span className="font-semibold">{activeListings.toLocaleString('ar')}</span>
          </div>
        </CardContent>
      </Card>
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
