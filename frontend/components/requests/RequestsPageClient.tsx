'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ClipboardList,
  Plus,
  ArrowRight,
  Wrench,
  ShoppingBag,
  Home,
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
  parseRequestSort,
  type RequestSort,
} from '@/components/requests/RequestFilters';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { cn } from '@/lib/utils';

const TYPE_CHIPS: Array<{
  value: RequestType | undefined;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { value: undefined, label: 'الكل', icon: ClipboardList },
  { value: 'SERVICE', label: 'خدمات', icon: Wrench },
  { value: 'PRODUCT', label: 'منتجات', icon: ShoppingBag },
  { value: 'RENTAL', label: 'إيجار', icon: Home },
];

function buildTypeHref(
  type: RequestType | undefined,
  city?: string,
  q?: string,
  sort?: RequestSort,
): string {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (city) params.set('city', city);
  if (q) params.set('q', q);
  if (sort && sort !== 'newest') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `${ROUTES.requests}?${qs}` : ROUTES.requests;
}

function emptyDescription(opts: {
  type?: RequestType;
  city?: string;
  q?: string;
}): string {
  const parts: string[] = [];
  if (opts.type) parts.push(`نوع «${REQUEST_TYPE_LABEL[opts.type]}»`);
  if (opts.city) parts.push(`مدينة «${opts.city}»`);
  if (opts.q) parts.push(`بحث «${opts.q}»`);
  if (parts.length === 0) {
    return 'كن أول من ينشر طلبًا — أو عد لاحقًا لرؤية الطلبات الجديدة.';
  }
  return `لا نتائج لـ ${parts.join(' · ')}. جرّب مسح الفلاتر أو نشر طلب جديد.`;
}


export function RequestsPageClient() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const typeParam = searchParams.get('type');
  const type =
    typeParam === 'SERVICE' || typeParam === 'PRODUCT' || typeParam === 'RENTAL'
      ? (typeParam as RequestType)
      : undefined;
  const city = searchParams.get('city') || undefined;
  const q = searchParams.get('q') || undefined;
  const sort = parseRequestSort(searchParams.get('sort'));

  const { data, isLoading, isFetching, isError, refetch } = useOpenRequests({
    type,
    city,
    q,
    page,
    limit: 20,
    sort,
  });

  // Server applies sort across the full result set; items are already ordered.
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
    q,
    sort: sort !== 'newest' ? sort : undefined,
  };

  const hasActiveFilters = Boolean(type || city || q || sort !== 'newest');

  return (
    <div className="min-h-[50vh] pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-10">
      <div className="border-b border-primary/10 bg-gradient-to-b from-primary/[0.09] via-primary/[0.04] to-transparent">
        <div className="container mx-auto max-w-7xl space-y-5 px-3 py-6 sm:px-4 sm:py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                سوق الطلبات
              </p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                اطلب ما تحتاجه — وقدّم عرضك
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                تصفّح الطلبات المفتوحة للخدمات والمنتجات والإيجار، وقدّم عرضك مباشرة
                لصاحب الطلب.
              </p>
              {!isLoading && typeof total === 'number' && total > 0 ? (
                <p className="text-xs font-medium text-foreground/80">
                  <span className="tabular-nums text-primary">
                    {total.toLocaleString('ar')}
                  </span>{' '}
                  طلب مفتوح الآن
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="min-h-10 gap-1.5 shadow-sm" asChild>
                <Link href={ROUTES.requestNew}>
                  <Plus className="h-4 w-4" aria-hidden />
                  أضف طلبًا
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="min-h-10" asChild>
                <Link href={ROUTES.myOpenRequests}>طلباتي</Link>
              </Button>
              <Button variant="outline" size="sm" className="min-h-10" asChild>
                <Link href={ROUTES.myOpenRequestOffers}>عروضي</Link>
              </Button>
            </div>
          </div>

          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="تصفية حسب النوع"
          >
            {TYPE_CHIPS.map(({ value, label, icon: Icon }) => {
              const active = value === type || (value === undefined && !type);
              return (
                <Link
                  key={label}
                  href={buildTypeHref(value, city, q, sort)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border/80 bg-card/90 text-foreground hover:border-primary/40 hover:bg-muted/40',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-7xl space-y-4 px-3 py-5 sm:px-4 sm:py-6">
        <RequestFilters type={type} city={city} q={q} sort={sort} hideTypeChips />


        <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} />

        {isLoading && !data ? <RequestListSkeleton /> : null}

        {isError ? (
          <EmptyState
            title="تعذّر تحميل الطلبات"
            description="تحقق من الاتصال ثم أعد المحاولة."
            action={
              <Button variant="outline" onClick={() => void refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}

        {(data || !isLoading) && !isError ? (
          items.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title={hasActiveFilters ? 'لا طلبات مطابقة' : 'لا طلبات مفتوحة بعد'}
              description={emptyDescription({ type, city, q })}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {hasActiveFilters ? (
                    <Button variant="outline" asChild>
                      <Link href={ROUTES.requests}>مسح الفلاتر</Link>
                    </Button>
                  ) : null}
                  <Button asChild>
                    <Link href={ROUTES.requestNew}>
                      <Plus className="me-1.5 h-4 w-4" aria-hidden />
                      نشر طلب
                    </Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <ul
              className={cn(
                'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5',
                isFetching && !isLoading && 'opacity-80 transition-opacity',
              )}
            >
              {items.map((r) => (
                <RequestCard key={r.id} request={r} className="min-w-0 h-full" />
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

        <div className="flex items-center justify-center gap-3 pt-2 text-sm text-muted-foreground sm:hidden">
          <Link href={ROUTES.home} className="inline-flex items-center gap-1 hover:text-foreground">
            الرئيسية
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
