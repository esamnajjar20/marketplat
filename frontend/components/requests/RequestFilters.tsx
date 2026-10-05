'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ROUTES, CITIES } from '@/lib/constants';
import type { RequestType } from '@/types/request.types';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';

/** ترتيب قائمة الطلبات (واجهة — يُطبَّق على الصفحة الحالية) */
export type RequestSort = 'newest' | 'expiring' | 'budget_high' | 'fewest_offers';

export const REQUEST_SORT_OPTIONS: { value: RequestSort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'expiring', label: 'الأقرب للانتهاء' },
  { value: 'budget_high', label: 'الأعلى ميزانية' },
  { value: 'fewest_offers', label: 'أقل عروضًا' },
];

export function buildRequestsHref(opts: {
  type?: RequestType;
  city?: string;
  serviceTypeId?: string;
  q?: string;
  sort?: RequestSort;
  page?: number;
  base?: string;
}): string {
  const base = opts.base ?? ROUTES.requests;
  const p = new URLSearchParams();
  if (opts.type) p.set('type', opts.type);
  if (opts.city) p.set('city', opts.city);
  if (opts.serviceTypeId && opts.type === 'SERVICE') p.set('serviceTypeId', opts.serviceTypeId);
  if (opts.q) p.set('q', opts.q);
  if (opts.sort && opts.sort !== 'newest') p.set('sort', opts.sort);
  if (opts.page && opts.page > 1) p.set('page', String(opts.page));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

export function parseRequestSort(raw: string | null | undefined): RequestSort {
  if (
    raw === 'expiring' ||
    raw === 'budget_high' ||
    raw === 'fewest_offers' ||
    raw === 'newest'
  ) {
    return raw;
  }
  return 'newest';
}

type Props = {
  type?: RequestType;
  city?: string;
  serviceTypeId?: string;
  q?: string;
  sort?: RequestSort;
  className?: string;
  /**
   * إخفاء شرائح النوع هنا لأن الـ Hero في RequestsPageClient يعرضها.
   * الافتراضي true لتجنّب تكرار UI. مرّر false فقط إذا استُخدم المكوّن
   * بدون Hero (مثلاً صفحة فرعية).
   */
  hideTypeChips?: boolean;
};

export function RequestFilters({
  type,
  city,
  serviceTypeId,
  q,
  sort = 'newest',
  className,
  // default true: type chips live in RequestsPageClient Hero — avoid duplicate filters
  hideTypeChips = true,
}: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(q ?? '');
  const { data: serviceTypes } = useServiceTypes();
  const hasFilters = Boolean(type || city || serviceTypeId || q || (sort && sort !== 'newest'));

  useEffect(() => {
    setSearchInput(q ?? '');
  }, [q]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    router.replace(
      buildRequestsHref({
        type,
        city,
        serviceTypeId: type === 'SERVICE' ? serviceTypeId : undefined,
        q: searchInput.trim() || undefined,
        sort,
        page: 1,
      }),
    );
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border border-border/60 bg-card/95 p-3 shadow-xs',
        'sticky top-0 z-10 -mx-1 backdrop-blur supports-[backdrop-filter]:bg-card/90',
        'md:static md:mx-0 md:border md:border-border/50 md:bg-card/80 md:p-3 md:shadow-xs md:backdrop-blur-none',
        className,
      )}
    >
      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            className="flex h-11 w-full rounded-lg border border-input bg-background pe-3 ps-9 py-2 text-base sm:h-10 sm:text-sm"
            placeholder="ابحث في العنوان أو الوصف…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="بحث في الطلبات"
            enterKeyHint="search"
          />
        </div>
        <Button type="submit" variant="secondary" className="h-11 min-w-[4.5rem] sm:h-10">
          بحث
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="req-city-filter" className="text-sm text-muted-foreground">
          المدينة
        </label>
        <select
          id="req-city-filter"
          className="h-11 min-w-[8rem] flex-1 rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:flex-none sm:min-w-[9rem] sm:text-sm"
          value={city ?? ''}
          onChange={(e) => {
            const next = e.target.value || undefined;
            router.replace(buildRequestsHref({ type, city: next, serviceTypeId: type === 'SERVICE' ? serviceTypeId : undefined, q, sort, page: 1 }));
          }}
        >
          <option value="">كل المدن</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {type === 'SERVICE' ? (
          <>
            <label htmlFor="req-service-type-filter" className="text-sm text-muted-foreground">المجال</label>
            <select
              id="req-service-type-filter"
              className="h-11 min-w-[8rem] flex-1 rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:flex-none sm:min-w-[10rem] sm:text-sm"
              value={serviceTypeId ?? ''}
              onChange={(e) => {
                const next = e.target.value || undefined;
                router.replace(buildRequestsHref({ type, city, serviceTypeId: next, q, sort, page: 1 }));
              }}
            >
              <option value="">كل المجالات</option>
              {(serviceTypes ?? []).filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.nameAr}</option>
              ))}
            </select>
          </>
        ) : null}

        <label htmlFor="req-sort-filter" className="text-sm text-muted-foreground">
          الترتيب
        </label>
        <select
          id="req-sort-filter"
          className="h-11 min-w-[8rem] flex-1 rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:flex-none sm:min-w-[10rem] sm:text-sm"
          value={sort}
          onChange={(e) => {
            const next = parseRequestSort(e.target.value);
            router.replace(buildRequestsHref({ type, city, serviceTypeId: type === 'SERVICE' ? serviceTypeId : undefined, q, sort: next, page: 1 }));
          }}
        >
          {REQUEST_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1" asChild>
            <Link href={buildRequestsHref({ type, city, serviceTypeId: type === 'SERVICE' ? serviceTypeId : undefined, q, sort, page: 1 })}>
              <X className="h-3.5 w-3.5" aria-hidden />
              مسح الفلاتر
            </Link>
          </Button>
        )}
      </div>

      {!hideTypeChips && (
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none"
          role="group"
          aria-label="نوع الطلب"
        >
          <Button
            variant={!type ? 'default' : 'outline'}
            size="sm"
            className="h-9 shrink-0 rounded-full px-4"
            asChild
          >
            <Link href={buildRequestsHref({ city, q, sort, page: 1 })}>الكل</Link>
          </Button>
          {(['SERVICE', 'PRODUCT', 'RENTAL'] as RequestType[]).map((t) => (
            <Button
              key={t}
              variant={type === t ? 'default' : 'outline'}
              size="sm"
              className="h-9 shrink-0 rounded-full px-4"
              asChild
            >
              <Link href={buildRequestsHref({ type: t, city, q, sort, page: 1 })}>
                {t === 'SERVICE' ? 'خدمة' : t === 'PRODUCT' ? 'منتج' : 'إيجار'}
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
