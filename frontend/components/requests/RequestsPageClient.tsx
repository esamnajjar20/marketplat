'use client';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
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
import { normalizeFilterPage, parseFilterEnum } from '../../../shared/filters';
import { Button } from '@/components/shared/ui/Button';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestCard } from '@/components/requests/RequestCard';
import {
  RequestFilters,
  type RequestSort,
} from '@/components/requests/RequestFilters';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { FilterChipGroup } from '@/components/shared/filters/FilterChipGroup';
import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { cn } from '@/lib/utils';
import type { OpenRequestsPageParams } from './RequestsPageShell';
import { formatNumber } from '@/lib/formatters';

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
  const filters = useUnifiedFilters({ basePath: ROUTES.requests, profile: 'openRequests', mode: 'push' });
  const searchParams = filters.params;
  const limit = initialParams.limit ?? 20;
  const page = normalizeFilterPage(searchParams.get('page'));
  const type = parseFilterEnum(searchParams.get('type'), ['SERVICE', 'PRODUCT', 'RENTAL'] as const);
  const city = searchParams.get('city')?.trim() || undefined;
  const serviceTypeId = type === 'SERVICE' ? searchParams.get('serviceTypeId')?.trim() || undefined : undefined;
  const q = searchParams.get('q')?.trim() || undefined;
  // Same whitelist as the server page (app/(public)/requests/page.tsx) so an
  // unknown ?sort= value falls back to 'newest' and the client query key
  // matches the server-hydrated one instead of hitting the API with garbage.
  const rawSort = searchParams.get('sort');
  const sort: RequestSort =
    rawSort === 'expiring' || rawSort === 'budget_high' || rawSort === 'fewest_offers' ? rawSort : 'newest';
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
      ? `${formatNumber(total)} طلب مفتوح`
      : undefined;

  return (
    <div className="min-h-[50vh] bg-[var(--color-page)] pb-0 dark:bg-background md:pb-10">
      <div className="container mx-auto max-w-7xl space-y-4 px-3 pt-5 sm:px-4 sm:pt-7">
        {/* Hero — design mockup */}
        <div className="rounded-2xl border border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] p-4 dark:border-primary/20 dark:bg-primary/10 sm:p-5">
          <p className="text-2xs-tight font-bold text-[var(--color-primary)] dark:text-primary">سوق الطلبات</p>
          <h1 className="mt-0.5 text-xl font-extrabold leading-snug tracking-tight text-foreground sm:text-2xl">
            اطلب ما تحتاجه — وقدّم عرضك
          </h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--color-text-primary)] dark:text-muted-foreground sm:text-sm">
            تصفّح الطلبات المفتوحة للخدمات والمنتجات والإيجار، وقدّم عرضك مباشرة لصاحب الطلب.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <IntentPrefetchLink
              href={ROUTES.requestNew}
              className="inline-flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-95 sm:flex-none" prefetch={false}
            >
              <Plus className="h-4 w-4" aria-hidden />
              أضف طلبًا
            </IntentPrefetchLink>
            <IntentPrefetchLink
              href={ROUTES.myOpenRequests}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-[var(--color-primary-border)] bg-card px-4 text-sm font-bold text-[var(--color-primary-strong)] dark:border-border dark:bg-card dark:text-primary sm:flex-none" prefetch={false}
            >
              طلباتي
            </IntentPrefetchLink>
            <IntentPrefetchLink
              href={ROUTES.myOpenRequestOffers}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-[var(--color-primary-border)] bg-card px-4 text-sm font-bold text-[var(--color-primary-strong)] dark:border-border dark:bg-card dark:text-primary sm:flex-none" prefetch={false}
            >
              عروضي
            </IntentPrefetchLink>
          </div>
        </div>

        {/* Request type selection uses the shared filter-chip primitive. */}
        <FilterChipGroup
          label="تصفية حسب النوع"
          value={type ?? ''}
          options={TYPE_CHIPS.map(({ value, label, icon: Icon }) => ({
            value: value ?? '',
            label,
            icon: <Icon className="h-3.5 w-3.5" />,
          }))}
          onChange={(next) => filters.updateMany({
            type: (next || null) as RequestType | null,
            serviceTypeId: next === 'SERVICE' ? serviceTypeId ?? null : null,
          }, { mode: 'push' })}
          variant="underline"
          className="[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        />

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
                    <Button variant="outline" onClick={() => filters.clear([], 'push')}>
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
