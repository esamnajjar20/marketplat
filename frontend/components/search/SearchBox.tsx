'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
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
import { arabicNormalize } from '@/lib/arabicNormalize';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  // DESKTOP-AUDIT-03: GlobalSearchShortcut (Ctrl/Cmd+K) appends
  // ?focus=1 when it navigates here from elsewhere in the app — this
  // is the one SearchBox instance that route actually renders
  // (app/(public)/search/page.tsx). Focus the field, then strip the
  // param via router.replace so it doesn't linger in the URL bar or
  // get re-triggered on a manual refresh/back-navigation.
  useEffect(() => {
    if (sp.get('focus') !== '1') return;
    inputRef.current?.focus();
    const params = new URLSearchParams(sp.toString());
    params.delete('focus');
    const query = params.toString();
    router.replace(query ? `${ROUTES.search}?${query}` : ROUTES.search);
    // Only ever meant to run once per navigation that carries the
    // param — deliberately not depending on `sp`/`router` themselves,
    // which would re-fire this on every param change this effect
    // itself just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(q: string) {
    const params = new URLSearchParams(sp.toString());
    // FIX SEARCHBOX-NORMALIZE-DRIFT-01: reuse lib/arabicNormalize (the
    // client-side mirror of SQL arabic_normalize) instead of an inline
    // partial copy. The inline version handled alef/yeh fold but missed
    // tatweel + tashkeel stripping, so "سيـارة" (with tatweel) went to
    // the API as-is while offlineSearchIndex would have folded it to
    // "سيارة" -- same query, different results depending on
    // connectivity. lowercase:false because the URL `q` is also what
    // SearchResults renders in the "بحثاً عن ..." line; folding
    // "iPhone" to "iphone" there is not a matching concern and only
    // hurts readability. The server applies its own lowercase for
    // matching regardless.
    const trimmed = arabicNormalize(q, { lowercase: false })
      .replace(/\s+/g, ' ')
      .trim();
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
            ref={inputRef}
            id="global-search-input"
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
