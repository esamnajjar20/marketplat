/**
 * SearchBar — controlled input that pushes query params to /search.
 */
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search }  from 'lucide-react';
import { Input }  from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
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
    <form onSubmit={handleSubmit} className={cn('flex w-full gap-2', className)}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث عن سيارة، شقة، جهاز…"
        className="flex-1"
        aria-label="ابحث في الإعلانات"
      />
      <Button type="submit" size="sm" aria-label="بحث">
        <Search className="h-4 w-4 sm:hidden" />
        <span className="hidden sm:inline">بحث</span>
      </Button>
    </form>
  );
}
