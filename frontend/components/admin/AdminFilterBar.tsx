'use client';

/**
 * Shared admin list filter chrome: search + status/segment tabs, always
 * synced to the URL so deep links from the ops queue work and refresh
 * keeps the same view.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { cn } from '@/lib/utils';

export type AdminFilterTab = {
  value: string;
  label: string;
};

type Props = {
  /** Query param for the free-text search (default `q`). */
  searchParam?: string;
  searchPlaceholder?: string;
  /** Query param for the active tab (default `status`). */
  tabParam?: string;
  tabs: AdminFilterTab[];
  /** When URL has no tab value, use this. */
  defaultTab: string;
  className?: string;
};

export function AdminFilterBar({
  searchParam = 'q',
  searchPlaceholder = 'بحث…',
  tabParam = 'status',
  tabs,
  defaultTab,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const urlSearch = sp.get(searchParam) ?? '';
  const urlTab = sp.get(tabParam) ?? defaultTab;

  const [search, setSearch] = useState(urlSearch);

  useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      // Reset page when filters change
      // FIX FILTER-BAR-DEFAULT-TAB-01 (part 2): `'page' in patch === false`
      // worked (relational `in` binds tighter than equality `===`) but
      // read as if it were `'page' in (patch === false)`. Same logic,
      // clearer form.
      if (!('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp],
  );

  // Debounce search → URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === urlSearch) return;
      replaceParams({ [searchParam]: search.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [search, urlSearch, replaceParams, searchParam]);

  const hasFilters = Boolean(urlSearch) || urlTab !== defaultTab;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="relative w-full sm:w-auto sm:min-w-[220px] sm:max-w-xs">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6459]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 rounded-[10px] border-[#D9D1C3] bg-card ps-8 text-[13px]"
          aria-label={searchPlaceholder}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((tab) => {
          const active = urlTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => replaceParams({
                [tabParam]: tab.value === defaultTab ? null : tab.value,
              })}
              className={cn(
                'inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-bold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-[#EAE3D6] bg-card text-[#4A433A] hover:bg-muted/50',
              )}
            >
              {tab.label}
            </button>
          );
        })}
        {hasFilters ? (
          <button
            type="button"
            onClick={() => replaceParams({ [searchParam]: null, [tabParam]: null })}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-[#EAE3D6] bg-card px-3 text-[12px] font-bold text-[#6B6459] hover:bg-muted/50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            مسح الفلتر
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal scroll wrapper for wide admin tables on small screens. */
export function AdminTableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto overscroll-x-contain rounded-[14px] border border-[#EAE3D6]', className)}>
      <div className="min-w-[640px]">{children}</div>
    </div>
  );
}
