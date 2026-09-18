'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { addRecentSearch, suggestRecentSearches } from '@/lib/recentSearches';

/**
 * SearchBar — controlled input that pushes query params to /search.
 * Saves successful queries to recent search history (localStorage).
 * PHASE-3: prefix suggestions from ranked local history.
 */
export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

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
          // delay so click on suggestion registers
          window.setTimeout(() => setOpen(false), 150);
        }}
        placeholder="ابحث عن سيارة، شقة، جهاز…"
        className="ps-9"
        aria-label="ابحث في الإعلانات"
        autoComplete="off"
      />
      <button
        type="submit"
        className="absolute start-2 top-1/2 -translate-y-1/2 text-muted-foreground"
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
                className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-muted"
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
