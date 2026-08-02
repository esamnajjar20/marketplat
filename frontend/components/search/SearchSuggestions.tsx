'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchSuggestions } from '@/hooks/queries/useSearch';
import { cn } from '@/lib/utils';

interface Props {
  query: string;
  onSelect: (suggestion: string) => void;
  className?: string;
}

// No debounce utility exists anywhere in this codebase yet (checked
// hooks/ and lib/) — a small local debounce here avoids pulling in a
// new dependency (lodash.debounce, use-debounce, etc.) for a single
// call site. If a second caller needs the same pattern later, this is
// the natural point to extract it into hooks/useDebouncedValue.ts.
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Autocomplete dropdown for the search input. Debounces the raw
 * keystroke value by 300ms before it ever reaches useSearchSuggestions
 * — without this, every keystroke would fire its own GET
 * /search/suggestions request (the hook's own `enabled` gate only
 * guards the 2-character minimum, not typing speed).
 */
export function SearchSuggestions({ query, onSelect, className }: Props) {
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: suggestions, isFetching } = useSearchSuggestions(debouncedQuery);

  const trimmed = query.trim();
  if (trimmed.length < 2) return null;
  if (!isFetching && (!suggestions || suggestions.length === 0)) return null;

  return (
    <div
      role="listbox"
      aria-label="اقتراحات البحث"
      className={cn(
        'absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg',
        className
      )}
    >
      {isFetching && !suggestions?.length ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">جارٍ البحث...</div>
      ) : (
        <ul>
          {suggestions?.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onSelect(suggestion)}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-muted"
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{suggestion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
