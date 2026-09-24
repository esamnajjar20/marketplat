'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchSuggestions } from '@/hooks/queries/useSearch';
import { cn } from '@/lib/utils';

interface Props {
  query: string;
  onSelect: (suggestion: string) => void;
  className?: string;
  /** SW-SUGGESTIONS-KBD-01: index of the currently keyboard-selected
   * option (-1 when none). Owned by SearchBox so ArrowUp/Down on the
   * input can drive it without this component needing its own key
   * handlers — the input keeps focus, and the aria-selected attribute
   * below reflects the real selection state instead of hardcoded
   * false. */
  activeIndex?: number;
  /** Reports the current suggestion array up to SearchBox so it can
   * clamp activeIndex and resolve Enter-to-select without duplicating
   * the fetch. */
  onListChange?: (list: string[]) => void;
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
export function SearchSuggestions({
  query,
  onSelect,
  className,
  activeIndex = -1,
  onListChange,
}: Props) {
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data: suggestions, isFetching } = useSearchSuggestions(debouncedQuery);

  const trimmed = query.trim();
  const willRender = trimmed.length >= 2 && (isFetching || (suggestions && suggestions.length > 0));

  // SW-SUGGESTIONS-KBD-01: report list to parent whenever it changes.
  // Empty array when not rendering, so the parent's clamp logic sees
  // the effective length as 0 while the dropdown is hidden.
  useEffect(() => {
    if (!onListChange) return;
    onListChange(willRender && suggestions ? suggestions : []);
  }, [suggestions, willRender, onListChange]);

  if (!willRender) return null;

  return (
    <div
      role="listbox"
      aria-label="اقتراحات البحث"
      className={cn(
        'absolute inset-x-0 top-full z-[100] mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg',
        className
      )}
    >
      {isFetching && !suggestions?.length ? (
        <div className="px-3 py-2 text-sm text-muted-foreground">جارٍ البحث...</div>
      ) : (
        <ul>
          {suggestions?.map((suggestion, i) => (
            <li key={suggestion}>
              <button
                type="button"
                id={`search-suggestion-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => onSelect(suggestion)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-start text-sm',
                  i === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                )}
              >
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{suggestion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
