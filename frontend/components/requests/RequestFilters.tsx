'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ROUTES, CITIES } from '@/lib/constants';
import type { RequestType } from '@/types/request.types';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
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
  if (raw === 'expiring' || raw === 'budget_high' || raw === 'fewest_offers' || raw === 'newest') {
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
  /** عدد النتائج للعرض بجانب الترتيب */
  totalLabel?: string;
};

const pill =
  'h-10 w-full rounded-full border border-[#EAE3D6] bg-white px-3 text-sm font-semibold text-foreground dark:border-border dark:bg-card';

export function RequestFilters({
  type,
  city,
  serviceTypeId,
  q,
  sort = 'newest',
  className,
  totalLabel,
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
    <div className={cn('space-y-2.5', className)}>
      <form onSubmit={onSearch} className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          className={cn(pill, 'ps-9 pe-3')}
          placeholder="ابحث في العنوان أو الوصف…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="بحث في الطلبات"
          enterKeyHint="search"
        />
      </form>

      <div className="grid grid-cols-2 gap-2">
        <select
          id="req-city-filter"
          className={pill}
          value={city ?? ''}
          aria-label="المدينة"
          onChange={(e) => {
            const next = e.target.value || undefined;
            router.replace(
              buildRequestsHref({
                type,
                city: next,
                serviceTypeId: type === 'SERVICE' ? serviceTypeId : undefined,
                q,
                sort,
                page: 1,
              }),
            );
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
          <select
            id="req-service-type-filter"
            className={pill}
            value={serviceTypeId ?? ''}
            aria-label="المجال"
            onChange={(e) => {
              const next = e.target.value || undefined;
              router.replace(buildRequestsHref({ type, city, serviceTypeId: next, q, sort, page: 1 }));
            }}
          >
            <option value="">كل المجالات</option>
            {(serviceTypes ?? [])
              .filter((t) => t.isActive)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameAr}
                </option>
              ))}
          </select>
        ) : (
          <select className={cn(pill, 'opacity-60')} disabled aria-label="المجال" value="">
            <option value="">كل المجالات</option>
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {totalLabel ? (
          <p className="text-[13px] font-extrabold text-foreground">{totalLabel}</p>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <select
            id="req-sort-filter"
            className="h-9 rounded-full border border-[#EAE3D6] bg-white px-3 text-xs font-bold text-foreground dark:border-border dark:bg-card"
            value={sort}
            aria-label="الترتيب"
            onChange={(e) => {
              const next = parseRequestSort(e.target.value);
              router.replace(
                buildRequestsHref({
                  type,
                  city,
                  serviceTypeId: type === 'SERVICE' ? serviceTypeId : undefined,
                  q,
                  sort: next,
                  page: 1,
                }),
              );
            }}
          >
            {REQUEST_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasFilters ? (
            <Link
              href={ROUTES.requests}
              className="inline-flex h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              مسح
            </Link>
          ) : null}
        </div>
      </div>

    </div>
  );
}
