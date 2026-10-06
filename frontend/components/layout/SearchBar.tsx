'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { addRecentSearch, suggestRecentSearches } from '@/lib/recentSearches';

/**
 * SearchBar — controlled input that pushes query params to /search.
 * Saves successful queries to recent search history (localStorage).
 * prefix suggestions from ranked local history.
 */
export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  // use window.setTimeout's return type
  // (number) — global setTimeout's return type differs across lib configs.
  const blurTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
  }, []);

  const suggestions = useMemo(
    () => (query.trim().length >= 1 ? suggestRecentSearches(query, 5) : suggestRecentSearches('', 5)),
    [query],
  );

  function go(q: string) {
    const trimmed = q.trim();
    if (trimmed) addRecentSearch(trimmed);
    setOpen(false);
    router.push(`${ROUTES.search}${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''}`);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    go(query);
  }

  return (
    <form onSubmit={handleSubmit} className={cn('relative w-full', className)}>
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // was an un-tracked setTimeout —
          // if the component unmounted during the 150ms delay, setOpen
          // fired on an unmounted component (harmless in React 18+ but
          // a leak). Track and clear it.
          if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
          blurTimerRef.current = window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder="ابحث عن سيارة، شقة، جهاز…"
        className="ps-9"
        aria-label="ابحث في الإعلانات"
        autoComplete="off"
      />
      <button
        type="submit"
        className="absolute start-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        aria-label="بحث"
      >
        <Search className="h-4 w-4" />
      </button>
      {open && suggestions.length > 0 && (
        <ul
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover py-1 text-sm shadow-md"
          role="listbox"
        >
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(s);
                  go(s);
                }}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
