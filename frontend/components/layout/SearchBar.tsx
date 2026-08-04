/**
 * SearchBar — controlled input that pushes query params to /search.
 *
 * UX-FIX: the search icon used to sit in a separate <Button> beside the
 * input — on narrow mobile widths that split the tap target in two and
 * ate horizontal space that the input itself needed. The icon now lives
 * inside the field as a submit button positioned absolutely over its
 * trailing edge (ps-9 on the input reserves the room in logical/RTL-safe
 * units), so the whole thing reads as one control instead of two.
 */
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search }  from 'lucide-react';
import { Input }  from '@/components/shared/ui/Input';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`${ROUTES.search}?q=${encodeURIComponent(query.trim())}`);
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
        className="absolute inset-y-0 start-0 flex items-center justify-center px-2.5 text-muted-foreground hover:text-foreground"
      >
        <Search className="h-4 w-4" />
      </button>
    </form>
  );
}
