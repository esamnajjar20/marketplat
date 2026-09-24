'use client';

import { useState, useEffect, useRef, useCallback, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  // SW-SEARCHBOX-KBD-01: keyboard-driven selection for the two
  // dropdowns (recent list and suggestions). -1 = nothing selected.
  // Owned here so ArrowUp/Down can drive it while the input keeps
  // focus. See the onKeyDown handler below.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestionsList, setSuggestionsList] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  // SW-FIX-SEARCHBOX-URL-SYNC: `defaultValue` was only read once on mount.
  // On the Next.js App Router the same /search route stays mounted across
  // ?q= changes (back/forward, new search from a suggestion), so the
  // input kept showing the previous query while the URL/results had
  // already moved on. Syncing here keeps the visible value honest.
  // (Deeper solution: key={q} on the caller — see SearchBox usage.)
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  // SW-SEARCHBOX-KBD-01: reset selection whenever the query changes
  // or the dropdown closes. Otherwise ArrowDown, then typing a new
  // character, would leave the highlight on a stale index.
  useEffect(() => {
    setActiveIndex(-1);
  }, [value, showSuggestions]);

  // Hoisted above the two dropdown blocks so the keyboard handler
  // below can reference them. `trimmed` is derived from value (never
  // stale), and showRecent matches the exact condition used by the
  // recent-dropdown render below.
  const trimmed = value.trim();
  const showRecent = showSuggestions && trimmed.length < 2 && recent.length > 0;

  // Effective list length of whichever dropdown is currently visible.
  // Both never render simultaneously (recent is <2 chars, suggestions
  // is >=2 chars), so a single activeIndex is unambiguous.
  const activeListLength = showRecent
    ? recent.length
    : showSuggestions && trimmed.length >= 2
      ? suggestionsList.length
      : 0;

  // Clamp when the list shrinks (e.g. suggestions returned fewer items
  // after a debounce, or the recent list was cleared). Without this,
  // activeIndex could point past the end.
  useEffect(() => {
    if (activeIndex >= activeListLength) {
      setActiveIndex(activeListLength > 0 ? activeListLength - 1 : -1);
    }
  }, [activeListLength, activeIndex]);

  // Keep the highlighted option scrolled into view as the user arrows
  // through a long list. The recent list and the suggestions list both
  // give their buttons an id prefixed by which dropdown they belong
  // to; querying by that id from the container is safer than relying
  // on children order (React may reorder under the hood).
  useEffect(() => {
    if (activeIndex < 0) return;
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `#search-option-${activeIndex}, #search-suggestion-${activeIndex}`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

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

  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      const len = activeListLength;

      if (e.key === 'Escape') {
        if (showSuggestions) {
          e.preventDefault();
          setShowSuggestions(false);
          setActiveIndex(-1);
        }
        return;
      }

      if (len === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1 >= len ? 0 : i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 < 0 ? len - 1 : i - 1));
        return;
      }
      if (e.key === 'Enter') {
        if (activeIndex < 0 || activeIndex >= len) return;
        // Only intercept Enter when a row is actually selected —
        // otherwise the form's own submit (search for the typed text)
        // is what the user wants.
        e.preventDefault();
        const picked = showRecent
          ? recent[activeIndex]
          : suggestionsList[activeIndex];
        if (picked) handleSelectSuggestion(picked);
      }
    },
    // handleSelectSuggestion is intentionally omitted: including it
    // would cascade (navigate -> sp -> new ref on every URL change),
    // re-creating this handler on every render with no benefit. The
    // closure captured here is always fresh enough — it re-runs on
    // every relevant state change (activeIndex, list length, query)
    // and the underlying setters are React-stable. If this ever needs
    // a stale-safe call, refactor handleSelectSuggestion to a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeListLength, activeIndex, showRecent, showSuggestions, recent, suggestionsList],
  );

  function handleSelectSuggestion(suggestion: string) {
    setValue(suggestion);
    setShowSuggestions(false);
    navigate(suggestion);
  }

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
            onKeyDown={handleInputKeyDown}
            placeholder="ابحث عن منتجات، محلات، إعلانات، خدمات..."
            className={cn('ps-9', inputClassName)}
            aria-label="بحث"
            aria-autocomplete="list"
            // SW-FIX-SEARCHBOX-ARIA-EXPANDED: was only true when the
            // suggestions list had items — but SearchSuggestions renders
            // its own 'جارٍ البحث...' state while fetching, in which case
            // the popover IS visible to the user while aria-expanded
            // stayed false. Better to announce the actual popover state.
            aria-expanded={showRecent || (showSuggestions && trimmed.length >= 2)}
            aria-controls="search-dropdown"
            aria-activedescendant={
              activeIndex >= 0
                ? showRecent
                  ? `search-option-${activeIndex}`
                  : `search-suggestion-${activeIndex}`
                : undefined
            }
            autoComplete="off"
          />
        </div>
        <Button type="submit">بحث</Button>
      </form>

      {showRecent && (
        <div
          ref={listRef}
          id="search-dropdown"
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
            {recent.map((item, i) => (
              <li key={item}>
                <button
                  type="button"
                  id={`search-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm min-h-[44px]',
                    i === activeIndex ? 'bg-muted' : 'hover:bg-muted',
                  )}
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
        <SearchSuggestions
          query={value}
          onSelect={handleSelectSuggestion}
          activeIndex={activeIndex}
          onListChange={setSuggestionsList}
        />
      )}
    </div>
  );
}
