'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ROUTES, CITIES } from '@/lib/constants';
import { REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import type { RequestType } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';

const TYPES: RequestType[] = ['SERVICE', 'PRODUCT', 'RENTAL'];

export function buildRequestsHref(opts: {
  type?: RequestType;
  city?: string;
  q?: string;
  page?: number;
  base?: string;
}): string {
  const base = opts.base ?? ROUTES.requests;
  const p = new URLSearchParams();
  if (opts.type) p.set('type', opts.type);
  if (opts.city) p.set('city', opts.city);
  if (opts.q) p.set('q', opts.q);
  if (opts.page && opts.page > 1) p.set('page', String(opts.page));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

type Props = {
  type?: RequestType;
  city?: string;
  q?: string;
  className?: string;
};

export function RequestFilters({ type, city, q, className }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(q ?? '');
  const hasFilters = Boolean(type || city || q);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    // SW-FIX-REQ-FILTER-REPLACE: refinement within the same view — same
    // reasoning as the admin tables' FIX-NAV-REPLACE fixes. Push here
    // made Back require N presses after N searches.
    router.replace(buildRequestsHref({ type, city, q: searchInput.trim() || undefined, page: 1 }));
  }

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border border-border/60 bg-card/95 p-3 shadow-xs',
        'sticky top-0 z-10 -mx-1 backdrop-blur supports-[backdrop-filter]:bg-card/90',
        'md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none',
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
            placeholder="ابحث…"
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
          <Link href={buildRequestsHref({ city, q, page: 1 })}>الكل</Link>
        </Button>
        {TYPES.map((t) => (
          <Button
            key={t}
            variant={type === t ? 'default' : 'outline'}
            size="sm"
            className="h-9 shrink-0 rounded-full px-4"
            asChild
          >
            <Link href={buildRequestsHref({ type: t, city, q, page: 1 })}>
              {REQUEST_TYPE_LABEL[t]}
            </Link>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="req-city-filter" className="text-sm text-muted-foreground">
          المدينة
        </label>
        <select
          id="req-city-filter"
          className="h-11 min-w-[8rem] flex-1 rounded-lg border border-input bg-background px-3 text-base sm:h-9 sm:flex-none sm:text-sm"
          value={city ?? ''}
          onChange={(e) => {
            const next = e.target.value || undefined;
            router.replace(buildRequestsHref({ type, city: next, q, page: 1 }));
          }}
        >
          <option value="">كل المدن</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9" asChild>
            <Link href={ROUTES.requests} className="inline-flex items-center gap-1">
              <X className="h-3.5 w-3.5" aria-hidden />
              مسح
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
