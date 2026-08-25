'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { addRecentSearch } from '@/lib/recentSearches';

/**
 * SearchBar — controlled input that pushes query params to /search.
 * Saves successful queries to recent search history (localStorage).
 */
export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) addRecentSearch(trimmed);
    router.push(`${ROUTES.search}${trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''}`);
  }

  return (
    <form onSubmit={handleSubmit} className={cn('relative w-full', className)}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن سيارة، شقة، جهاز…"
        className="ps-9"
        aria-label="ابحث في الإعلانات"
      />
      <button
        type="submit"
        aria-label="بحث"
        className="absolute inset-y-0 start-0 flex min-w-[44px] items-center justify-center px-2.5 text-muted-foreground hover:text-foreground"
      >
        <Search className="h-4 w-4" />
      </button>
    </form>
  );
}
