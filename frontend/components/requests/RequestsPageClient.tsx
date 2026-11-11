'use client';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { useSearchParams } from 'next/navigation';
import { writeClientUrl } from '@/lib/urlWithParams';
import {
  ClipboardList,
  Plus,
  Wrench,
  ShoppingBag,
  Home,
  List,
} from 'lucide-react';
import { useOpenRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import type { RequestType } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestCard } from '@/components/requests/RequestCard';
import {
  RequestFilters,
  type RequestSort,
} from '@/components/requests/RequestFilters';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { cn } from '@/lib/utils';
import type { OpenRequestsPageParams } from './RequestsPageShell';

const TYPE_CHIPS: Array<{
  value: RequestType | undefined;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { value: undefined, label: 'الكل', icon: List },
  { value: 'SERVICE', label: 'خدمات', icon: Wrench },
  { value: 'PRODUCT', label: 'منتجات', icon: ShoppingBag },
  { value: 'RENTAL', label: 'إيجار', icon: Home },
];

function buildTypeHref(
  type: RequestType | undefined,
  city?: string,
  serviceTypeId?: string,
  q?: string,
  sort?: RequestSort,
): string {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (city) params.set('city', city);
  if (serviceTypeId && type === 'SERVICE') params.set('serviceTypeId', serviceTypeId);
  if (q) params.set('q', q);
  if (sort && sort !== 'newest') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `${ROUTES.requests}?${qs}` : ROUTES.requests;
}

function emptyDescription(opts: {
  type?: RequestType;
  city?: string;
  q?: string;
  serviceTypeId?: string;
}): string {
  const parts: string[] = [];
  if (opts.type) parts.push(`نوع «${REQUEST_TYPE_LABEL[opts.type]}»`);
  if (opts.city) parts.push(`مدينة «${opts.city}»`);
  if (opts.q) parts.push(`بحث «${opts.q}»`);
  if (opts.serviceTypeId && opts.type === 'SERVICE') parts.push('مجال خدمة محدد');
  if (parts.length === 0) {
    return 'كن أول من ينشر طلبًا — أو عد لاحقًا لرؤية الطلبات الجديدة.';
  }
  return `لا نتائج لـ ${parts.join(' · ')}. جرّب مسح الفلاتر أو نشر طلب جديد.`;
}

export function RequestsPageClient({ params: initialParams }: { params: OpenRequestsPageParams }) {
  const searchParams = useSearchParams();
  const limit = initialParams.limit ?? 20;
  const rawPage = Number(searchParams.get('page') ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10_000) : 1;
  const rawType = searchParams.get('type');
  const type: RequestType | undefined = rawType === 'SERVICE' || rawType === 'PRODUCT' || rawType === 'RENTAL' ? rawType : undefined;
  const city = searchParams.get('city') || undefined;
  const serviceTypeId = type === 'SERVICE' ? searchParams.get('serviceTypeId') || undefined : undefined;
  const q = searchParams.get('q') || undefined;
  const sort = (searchParams.get('sort') as RequestSort | null) ?? 'newest';
  const params: OpenRequestsPageParams = { page, limit, type, city, serviceTypeId, q, sort };

  const { data, isLoading, isFetching, isError, refetch } = useOpenRequests(params);

  const items = Array.isArray(data?.data) ? data.data : [];

  const meta = (
    data as
      | {
          meta?: {
            pagination?: { totalPages?: number; total?: number };
            totalPages?: number;
            total?: number;
          };
        }
      | undefined
  )?.meta;
  const totalPages = meta?.pagination?.totalPages ?? meta?.totalPages ?? 1;
  const total = meta?.pagination?.total ?? meta?.total;

  const spRecord: Record<string, string | undefined> = {
    type,
    city,
    serviceTypeId,
    q,
    sort: sort !== 'newest' ? sort : undefined,
  };

  const hasActiveFilters = Boolean(type || city || serviceTypeId || q || sort !== 'newest');

  const totalLabel =
    !isLoading && typeof total === 'number' && total > 0
      ? `${total.toLocaleString('ar')} طلب مفتوح`
      : undefined;

  return (
    <div className="min-h-[50vh] bg-[var(--legacy-page-surface)] pb-0 dark:bg-background md:pb-10">
      <div className="container mx-auto max-w-7xl space-y-4 px-3 pt-5 sm:px-4 sm:pt-7">
        {/* Hero — design mockup */}
        <div className="rounded-2xl border border-[var(--legacy-primary-border)] bg-[var(--legacy-primary-soft)] p-4 dark:border-primary/20 dark:bg-primary/10 sm:p-5">
          <p className="text-2xs-tight font-bold text-[var(--legacy-primary)] dark:text-primary">سوق الطلبات</p>
          <h1 className="mt-0.5 text-xl font-extrabold leading-snug tracking-tight text-foreground sm:text-2xl">
            اطلب ما تحتاجه — وقدّم عرضك
          </h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--legacy-foreground-warm)] dark:text-muted-foreground sm:text-sm">
            تصفّح الطلبات المفتوحة للخدمات والمنتجات والإيجار، وقدّم عرضك مباشرة لصاحب الطلب.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <IntentPrefetchLink
              href={ROUTES.requestNew}
              className="inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-[var(--legacy-primary)] px-4 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-95 sm:flex-none" prefetch={false}
            >
              <Plus className="h-4 w-4" aria-hidden />
              أضف طلبًا
            </IntentPrefetchLink>
            <IntentPrefetchLink
              href={ROUTES.myOpenRequests}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-[var(--legacy-primary-border)] bg-card px-4 text-sm font-bold text-[var(--legacy-primary-deep)] dark:border-border dark:bg-card dark:text-primary sm:flex-none" prefetch={false}
            >
              طلباتي
            </IntentPrefetchLink>
            <IntentPrefetchLink
              href={ROUTES.myOpenRequestOffers}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-[var(--legacy-primary-border)] bg-card px-4 text-sm font-bold text-[var(--legacy-primary-deep)] dark:border-border dark:bg-card dark:text-primary sm:flex-none" prefetch={false}
            >
              عروضي
            </IntentPrefetchLink>
          </div>
        </div>

        {/* Type tabs */}
        <div
          className="flex gap-1 overflow-x-auto border-b border-[var(--legacy-border)] dark:border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="تصفية حسب النوع"
        >
          {TYPE_CHIPS.map(({ value, label, icon: Icon }) => {
            const active = value === type || (value === undefined && !type);
            return (
              <button
                key={label}
                type="button"
                onClick={() => writeClientUrl(buildTypeHref(value, city, value === 'SERVICE' ? serviceTypeId : undefined, q, sort), 'push')}
                role="tab"
                aria-selected={active}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm-tight font-semibold transition-colors',
                  active
                    ? 'border-[var(--legacy-primary)] font-extrabold text-[var(--legacy-primary-deep)] dark:border-primary dark:text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        <RequestFilters
          type={type}
          city={city}
          serviceTypeId={serviceTypeId}
          q={q}
          sort={sort}
          totalLabel={totalLabel}
        />

        <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} />

        {isLoading && !data ? (
          <OfflineQueryFallback
            title="لا توجد نسخة محفوظة من الطلبات"
            loading={isLoading}
            description="لا تتوفر الطلبات المخزنة على هذا الجهاز. اتصل بالإنترنت لتحميلها ثم حاول مرة أخرى."
            fallback={<RequestListSkeleton />}
          />
        ) : null}

        {isError ? (
          <OfflineQueryFallback
            title="تعذّر تحميل الطلبات دون اتصال"
            description="لا توجد نسخة محفوظة من هذه الطلبات على الجهاز. اتصل بالإنترنت ثم أعد المحاولة."
            fallback={
              <EmptyState
                title="تعذّر تحميل الطلبات"
                description="تحقق من الاتصال ثم أعد المحاولة."
                action={
                  <Button variant="outline" onClick={() => void refetch()}>
                    إعادة المحاولة
                  </Button>
                }
              />
            }
          />
        ) : null}

        {(data || !isLoading) && !isError ? (
          items.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title={hasActiveFilters ? 'لا طلبات مطابقة' : 'لا طلبات مفتوحة بعد'}
              description={emptyDescription({ type, city, q, serviceTypeId })}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {hasActiveFilters ? (
                    <Button variant="outline" onClick={() => writeClientUrl(ROUTES.requests, 'push')}>
                      مسح الفلاتر
                    </Button>
                  ) : null}
                  <Button asChild>
                    <IntentPrefetchLink href={ROUTES.requestNew} prefetch={false}>
                      <Plus className="me-1.5 h-4 w-4" aria-hidden />
                      نشر طلب
                    </IntentPrefetchLink>
                  </Button>
                </div>
              }
            />
          ) : (
            <ul
              className={cn(
                'grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3',
                isFetching && !isLoading && 'opacity-80 transition-opacity',
              )}
            >
              {items.map((r) => (
                <li key={r.id}>
                  <RequestCard request={r} className="min-w-0" />
                </li>
              ))}
            </ul>
          )
        ) : null}

        <Pagination
          totalPages={Number(totalPages) || 1}
          currentPage={page}
          baseUrl={ROUTES.requests}
          searchParams={spRecord}
        />
      </div>
    </div>
  );
}
