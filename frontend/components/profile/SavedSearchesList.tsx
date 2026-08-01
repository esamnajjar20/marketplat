'use client';

import Link from 'next/link';
import { Search, Trash2, AlertTriangle, BellPlus } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useSavedSearches } from '@/hooks/queries/useSavedSearches';
import { useDeleteSavedSearch } from '@/hooks/mutations/useSavedSearchMutations';
import { CONDITION_LABELS, ROUTES } from '@/lib/constants';
import { formatDate, formatPrice } from '@/lib/formatters';
import type { SavedSearch, SavedSearchFilters } from '@/types/savedSearch.types';

/** Builds the /search URL that reproduces this saved search's filters,
 * so "عرض النتائج" shows exactly what the saved search would match —
 * same param names SearchResults.tsx/SearchFilters.tsx already read. */
function searchUrlFor(filters: SavedSearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.city) params.set('city', filters.city);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.condition) params.set('condition', filters.condition);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  return `${ROUTES.search}?${params.toString()}`;
}

function FilterChips({ filters }: { filters: SavedSearchFilters }) {
  const chips: string[] = [];
  if (filters.q) chips.push(`"${filters.q}"`);
  if (filters.city) chips.push(filters.city);
  if (filters.condition) chips.push(CONDITION_LABELS[filters.condition] ?? filters.condition);
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const min = filters.minPrice !== undefined ? formatPrice(filters.minPrice) : '0';
    const max = filters.maxPrice !== undefined ? formatPrice(filters.maxPrice) : '∞';
    chips.push(`${min} – ${max}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip, i) => (
        <Badge key={i} variant="secondary" className="font-normal">{chip}</Badge>
      ))}
    </div>
  );
}

function SavedSearchRow({ search }: { search: SavedSearch }) {
  const deleteSavedSearch = useDeleteSavedSearch();

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <BellPlus className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="font-medium truncate">{search.label}</h3>
        </div>
        <FilterChips filters={search.filters} />
        <p className="text-xs text-muted-foreground">
          أُنشئ في {formatDate(search.createdAt)}
          {search.lastNotifiedAt && <> · آخر تنبيه {formatDate(search.lastNotifiedAt)}</>}
        </p>
        <Link href={searchUrlFor(search.filters)} className="inline-block text-sm text-primary hover:underline">
          عرض النتائج المطابقة
        </Link>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`حذف البحث المحفوظ ${search.label}`}
        disabled={deleteSavedSearch.isPending}
        onClick={() => deleteSavedSearch.mutate(search.id)}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function SavedSearchesList() {
  const { data: searches, isLoading, isError, refetch } = useSavedSearches();

  if (isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل البحثات المحفوظة</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = searches ?? [];

  if (items.length === 0) {
    return (
      <EmptyState icon={<Search className="h-10 w-10" />}
        title="لا توجد بحثات محفوظة"
        description="احفظ بحثاً من صفحة النتائج وسنُعلمك عند نشر إعلان مطابق"
        action={<Link href={ROUTES.search}><Button variant="outline">تصفح الإعلانات</Button></Link>} />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((search) => <SavedSearchRow key={search.id} search={search} />)}
    </div>
  );
}
