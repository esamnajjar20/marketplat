'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Clock } from 'lucide-react';

import { Input } from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
import { SearchSuggestions } from '@/components/search/SearchSuggestions';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  addRecentSearch,
  getRecentSearches,
  clearRecentSearches,
} from '@/lib/recentSearches';

interface Props {
  defaultValue?: string;
  /** Applied to the underlying Input — e.g. light-on-dark styling when rendered on a tinted band. */
  inputClassName?: string;
}

/**
 * Unified search box — suggestions + recent local history when the
 * field is focused with an empty / short query.
 */
export function SearchBox({ defaultValue = '', inputClassName }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  function navigate(q: string) {
    const params = new URLSearchParams(sp.toString());
    const trimmed = q.trim();
    if (trimmed) {
      params.set('q', trimmed);
      addRecentSearch(trimmed);
      setRecent(getRecentSearches());
    } else {
      params.delete('q');
    }
    params.delete('page');
    router.push(`${ROUTES.search}?${params.toString()}`);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowSuggestions(false);
    navigate(value);
  }

  function handleSelectSuggestion(suggestion: string) {
    setValue(suggestion);
    setShowSuggestions(false);
    navigate(suggestion);
  }

  const trimmed = value.trim();
  const showRecent = showSuggestions && trimmed.length < 2 && recent.length > 0;

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} role="search" className="flex w-full gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              setRecent(getRecentSearches());
              setShowSuggestions(true);
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="ابحث عن منتجات، محلات، إعلانات، خدمات..."
            className={cn('ps-9', inputClassName)}
            aria-label="بحث"
            autoComplete="off"
          />
        </div>
        <Button type="submit">بحث</Button>
      </form>

      {showRecent && (
        <div
          role="listbox"
          aria-label="عمليات البحث الأخيرة"
          className="absolute inset-x-0 top-full z-[100] mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">عمليات البحث الأخيرة</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                clearRecentSearches();
                setRecent([]);
              }}
            >
              مسح
            </button>
          </div>
          <ul>
            {recent.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm hover:bg-muted min-h-[44px]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectSuggestion(item)}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{item}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showSuggestions && trimmed.length >= 2 && (
        <SearchSuggestions query={value} onSelect={handleSelectSuggestion} />
      )}
    </div>
  );
}
