/**
 * حالة شاشة الرئيسية — بحث، فلاتر، ترتيب.
 * المفضلة عبر useFavorites لإعادة الاستخدام في شاشات أخرى.
 */
import { useCallback, useState } from 'react';
import { useFavorites } from '@/features/ads/useFavorites';
import { homeFilterSchema, validate } from '@/lib/validation';

export type HomeFilters = {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type HomeSort = {
  sortBy: 'createdAt' | 'price' | 'views';
  sortOrder: 'asc' | 'desc';
};

export function useHomeScreenState() {
  const [query, setQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [filters, setFilters] = useState<HomeFilters>({});
  const [filterError, setFilterError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<HomeSort['sortBy']>('createdAt');
  const [sortOrder, setSortOrder] = useState<HomeSort['sortOrder']>('desc');

  const { favoriteIds, isFavorite, toggleFavorite, ready: favoritesReady } = useFavorites();

  const submitSearch = useCallback(() => {
    setSubmittedSearch(query.trim());
  }, [query]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSubmittedSearch('');
  }, []);

  const applyFilters = useCallback(() => {
    const checked = validate(homeFilterSchema, {
      city: cityInput,
      minPrice: minPriceInput,
      maxPrice: maxPriceInput,
    });
    if (!checked.ok) {
      setFilterError(checked.message);
      return { ok: false as const, message: checked.message };
    }
    setFilterError(null);
    setFilters({
      city: checked.data.city || undefined,
      minPrice: checked.data.minPrice ? Number(checked.data.minPrice) : undefined,
      maxPrice: checked.data.maxPrice ? Number(checked.data.maxPrice) : undefined,
    });
    setShowFilters(false);
    return { ok: true as const };
  }, [cityInput, minPriceInput, maxPriceInput]);

  const resetFilters = useCallback(() => {
    setCityInput('');
    setMinPriceInput('');
    setMaxPriceInput('');
    setFilters({});
    setFilterError(null);
    setShowFilters(false);
  }, []);

  const setSort = useCallback((next: Partial<HomeSort>) => {
    if (next.sortBy) setSortBy(next.sortBy);
    if (next.sortOrder) setSortOrder(next.sortOrder);
  }, []);

  /** Alias for screens that still call clearFilters */
  const clearFilters = resetFilters;

  return {
    query,
    setQuery,
    submittedSearch,
    submitSearch,
    clearSearch,

    showFilters,
    setShowFilters,
    cityInput,
    setCityInput,
    minPriceInput,
    setMinPriceInput,
    maxPriceInput,
    setMaxPriceInput,
    filters,
    filterError,
    applyFilters,
    resetFilters,
    clearFilters,

    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    setSort,

    favoriteIds,
    favoritesReady,
    toggleFavorite,
    isFavorite,
  };
}
