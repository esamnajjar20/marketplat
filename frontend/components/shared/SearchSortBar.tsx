'use client';

import { ArrowUpDown } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * (audit item #8): sort used to live only inside each page's
 * filters panel/sheet — on mobile that meant changing sort required
 * opening the same "تصفية" drawer as every other filter, with no
 * persistent, independent sort control. This bar is the single
 * implementation shared by /search (single `sort` param), the ads
 * category page, and /stores (both `sortBy`+`sortOrder` params) — see
 * the two prop shapes below. It renders identically on mobile and
 * desktop, always visible above the results, next to (not inside) the
 * filters trigger — so removing this from the three filters components
 * doesn't leave sort undiscoverable anywhere, only non-duplicated.
 */

interface SingleParamSort {
  /** e.g. components/search — one URL param carries the whole sort value. */
  mode: 'single';
  paramKey: string;
  options: readonly { label: string; value: string }[];
  /** Value to treat as "unset" when reading from the URL (kept out of the URL on select). */
  defaultValue: string;
}

interface CombinedParamSort {
  /** e.g. ads/stores — sortBy + sortOrder are two separate URL params. */
  mode: 'combined';
  sortByKey?: string;
  sortOrderKey?: string;
  options: readonly { label: string; sortBy: string; sortOrder: string }[];
  defaultSortBy: string;
  defaultSortOrder: string;
}

type SortConfig = SingleParamSort | CombinedParamSort;

interface Props {
  config: SortConfig;
  /**
   * Base path to push to. The ads category-page caller passes
   * usePathname() here (not a hardcoded '/search') so sort changes stay
   * on whichever page rendered this bar — same convention
   * ads/SearchFilters.tsx's own update() already follows ().
   */
  basePath: string;
  className?: string;
}

export function SearchSortBar({ config, basePath, className }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutate(params);
    params.delete('page');
    router.replace(`${basePath}?${params.toString()}`);
  }

  if (config.mode === 'single') {
    const { paramKey, options, defaultValue } = config;
    const value = sp.get(paramKey) ?? defaultValue;

    return (
      <div className={className ?? 'flex items-center gap-2'}>
        <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Select
          value={value}
          onValueChange={(v) => pushParams((params) => params.set(paramKey, v))}
        >
          <SelectTrigger aria-label="الترتيب" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const {
    options, defaultSortBy, defaultSortOrder,
    sortByKey = 'sortBy', sortOrderKey = 'sortOrder',
  } = config;
  const value = `${sp.get(sortByKey) ?? defaultSortBy}_${sp.get(sortOrderKey) ?? defaultSortOrder}`;

  return (
    <div className={className ?? 'flex items-center gap-2'}>
      <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Select
        value={value}
        onValueChange={(v) => {
          const [sortBy = defaultSortBy, sortOrder = defaultSortOrder] = v.split('_');
          pushParams((params) => {
            params.set(sortByKey, sortBy);
            params.set(sortOrderKey, sortOrder);
          });
        }}
      >
        <SelectTrigger aria-label="الترتيب" className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={`${o.sortBy}_${o.sortOrder}`} value={`${o.sortBy}_${o.sortOrder}`}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
