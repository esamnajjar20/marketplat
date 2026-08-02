'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

import { Input } from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
import { SearchSuggestions } from '@/components/search/SearchSuggestions';
import { ROUTES } from '@/lib/constants';

interface Props {
  defaultValue?: string;
}

/**
 * Unified search box — same submit-navigates-to-/search behavior as
 * ads/SearchInput.tsx, plus a suggestions dropdown. Existing filters
 * already in the URL (city/type/sort/categoryId) are preserved on
 * submit rather than reset — only `q` and `page` change, matching how
 * SearchFilters.tsx's own `update()` already treats every other filter
 * (it always keeps the rest of the URL's params intact).
 */
export function SearchBox({ defaultValue = '' }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const [showSuggestions, setShowSuggestions] = useState(false);

  function navigate(q: string) {
    const params = new URLSearchParams(sp.toString());
    const trimmed = q.trim();
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
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
            onFocus={() => setShowSuggestions(true)}
            // Delay so a suggestion button's onClick still registers
            // before the dropdown unmounts — a plain onBlur would hide
            // it first and swallow the click.
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="ابحث عن منتجات، محلات، إعلانات، خدمات..."
            className="ps-9"
            aria-label="بحث"
            autoComplete="off"
          />
        </div>
        <Button type="submit">بحث</Button>
      </form>

      {showSuggestions && (
        <SearchSuggestions query={value} onSelect={handleSelectSuggestion} />
      )}
    </div>
  );
}
