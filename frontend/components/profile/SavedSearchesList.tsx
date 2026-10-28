'use client';

import Link from 'next/link';
import { Trash2, AlertTriangle, Bookmark, RefreshCw } from 'lucide-react';
import { useSavedSearches } from '@/hooks/queries/useSavedSearches';
import { useDeleteSavedSearch } from '@/hooks/mutations/useSavedSearchMutations';
import { CONDITION_LABELS, ROUTES } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/formatters';
import type { SavedSearch, SavedSearchFilters } from '@/types/savedSearch.types';
import { cn } from '@/lib/utils';

function searchUrlFor(filters: SavedSearchFilters): string {
  const type = filters.type ?? 'ads';

  if (type === 'products') {
    const params = new URLSearchParams();
    if (filters.q) params.set('search', filters.q);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
    return `${ROUTES.products}?${params.toString()}`;
  }

  if (type === 'services') {
    const params = new URLSearchParams();
    if (filters.q) params.set('search', filters.q);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
    return `${ROUTES.services}?${params.toString()}`;
  }

  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.city) params.set('city', filters.city);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.condition) params.set('condition', filters.condition);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  return `${ROUTES.search}?${params.toString()}`;
}

const TYPE_LABELS: Record<'ads' | 'products' | 'services', string> = {
  ads: 'إعلانات',
  products: 'منتجات',
  services: 'خدمات',
};

const TYPE_CHIP: Record<'ads' | 'products' | 'services', string> = {
  ads: 'bg-[#E8F1EC] text-[#1F4D33]',
  products: 'bg-[#FBEEE6] text-[#8F3F14]',
  services: 'bg-[#F0EADF] text-[#4A433A]',
};

function filterChips(filters: SavedSearchFilters): string[] {
  const chips: string[] = [];
  if (filters.q) chips.push(filters.q);
  if (filters.city) chips.push(filters.city);
  if (filters.condition) chips.push(CONDITION_LABELS[filters.condition] ?? filters.condition);
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    if (filters.maxPrice !== undefined && filters.minPrice === undefined) {
      chips.push(`حتّى ${formatPrice(filters.maxPrice)}`);
    } else if (filters.minPrice !== undefined && filters.maxPrice === undefined) {
      chips.push(`من ${formatPrice(filters.minPrice)}`);
    } else {
      chips.push(`${formatPrice(filters.minPrice!)} – ${formatPrice(filters.maxPrice!)}`);
    }
  }
  return chips;
}

function SavedSearchRow({ search }: { search: SavedSearch }) {
  const deleteSavedSearch = useDeleteSavedSearch();
  const type = search.filters.type ?? 'ads';
  const chips = filterChips(search.filters);

  return (
    <article className="rounded-[14px] border border-[#EAE3D6] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.04)]">
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={`حذف البحث المحفوظ ${search.label}`}
          disabled={deleteSavedSearch.isPending}
          onClick={() => deleteSavedSearch.mutate(search.id)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#EAE3D6] bg-card text-[#6B6459] hover:bg-[#FBE9E7] hover:text-[#9B2118] disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className={cn('inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-bold', TYPE_CHIP[type])}>
              {TYPE_LABELS[type]}
            </span>
          </div>
          <h3 className="mt-1 text-[15px] font-extrabold text-foreground">{search.label}</h3>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="inline-flex h-[24px] items-center rounded-full bg-[#F0EADF] px-2.5 text-[12px] font-bold text-[#4A433A]"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[12px] text-[#6B6459]">
            أُنشئ في {formatDate(search.createdAt)}
            {search.lastNotifiedAt ? ` · آخر تنبيه ${formatDate(search.lastNotifiedAt)}` : ''}
          </p>
        </div>
      </div>
      <Link
        href={searchUrlFor(search.filters)}
        className="mt-3 flex h-10 w-full items-center justify-center rounded-[10px] border border-[#CFE0D5] bg-white text-[13px] font-bold text-[#1F4D33] transition-colors hover:bg-primary-soft"
      >
        عرض النتائج المطابقة
      </Link>
    </article>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-[#EAE3D6] bg-card p-3.5">
          <div className="flex gap-3">
            <div className="h-9 w-9 animate-pulse rounded-[10px] bg-[#EAE3D6]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="ms-auto h-5 w-16 animate-pulse rounded-full bg-[#F0EADF]" />
              <div className="h-4 w-2/5 animate-pulse rounded bg-[#EAE3D6]" />
              <div className="flex gap-1.5">
                <div className="h-6 w-16 animate-pulse rounded-full bg-[#F0EADF]" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-[#F0EADF]" />
              </div>
              <div className="h-3 w-1/3 animate-pulse rounded bg-[#F0EADF]" />
            </div>
          </div>
          <div className="mt-3 h-10 w-full animate-pulse rounded-[10px] bg-[#F0EADF]" />
        </div>
      ))}
    </div>
  );
}

export function SavedSearchesList() {
  const { data: searches, isLoading, isError, refetch } = useSavedSearches();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight text-foreground">عمليات البحث المحفوظة</h1>
        <p className="mt-0.5 text-[13px] text-[#6B6459]">عمليات البحث التي حفظتها للوصول إليها بسرعة.</p>
      </div>

      {isLoading && <ListSkeleton />}

      {isError && (
        <div className="rounded-[14px] border border-[#F1C9C4] bg-card px-4 py-4 text-center">
          <p className="flex items-center justify-center gap-2 text-[14px] font-bold text-[#9B2118]">
            <AlertTriangle className="h-4 w-4" />
            حدث خطأ أثناء تحميل عمليات البحث المحفوظة
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#CFE0D5] bg-white px-3 text-[13px] font-bold text-[#1F4D33]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
        </div>
      )}

      {!isLoading && !isError && (searches ?? []).length === 0 && (
        <div className="rounded-[14px] border border-[#EAE3D6] bg-card px-4 py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F0EADF] text-[#6B6459]">
            <Bookmark className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-[16px] font-extrabold text-foreground">لا توجد عمليات بحث محفوظة</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-[#6B6459]">
            احفظ بحثًا من صفحة النتائج وسنُعلمك عند نشر إعلان أو منتج أو خدمة مطابقة
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              prefetch={false}
              href={ROUTES.search}
              className="flex h-11 items-center justify-center rounded-[10px] border border-[#CFE0D5] bg-white text-[13px] font-bold text-[#1F4D33]"
            >
              تصفح الإعلانات
            </Link>
            <Link
              href={ROUTES.products}
              className="flex h-11 items-center justify-center rounded-[10px] border border-[#CFE0D5] bg-white text-[13px] font-bold text-[#1F4D33]"
            >
              تصفح المنتجات
            </Link>
            <Link
              href={ROUTES.services}
              className="flex h-11 items-center justify-center rounded-[10px] border border-[#CFE0D5] bg-white text-[13px] font-bold text-[#1F4D33]"
            >
              تصفح الخدمات
            </Link>
          </div>
        </div>
      )}

      {!isLoading && !isError && (searches ?? []).length > 0 && (
        <div className="space-y-3">
          {(searches ?? []).map((search) => (
            <SavedSearchRow key={search.id} search={search} />
          ))}
        </div>
      )}
    </div>
  );
}
