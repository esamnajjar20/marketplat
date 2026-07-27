/**
 * SearchInput — controlled search box that navigates to the search
 * results page on submit.
 *
 * FIX BUILD-01: This component was imported by
 * app/(public)/search/page.tsx but never created, causing a
 * "Module not found: Can't resolve '@/components/ads/SearchInput'"
 * build error.
 */
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

import { Input }  from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';

interface SearchInputProps {
  defaultValue?: string;
}

export function SearchInput({ defaultValue = '' }: SearchInputProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = value.trim();
    const query = trimmed ? `q=${encodeURIComponent(trimmed)}` : '';

    router.push(`${ROUTES.search}${query ? `?${query}` : ''}`);
  };

  return (
    <form onSubmit={handleSubmit} role="search" className="flex w-full gap-2">
      <div className="relative flex-1">
        {/* FIX UX-01: start-3/ps-9 (logical) instead of right-3/pr-9
            (physical) — same fix pattern as PriceInput.tsx. */}
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ابحث عن سيارات، عقارات، أجهزة..."
          className="ps-9"
          aria-label="بحث"
        />
      </div>
      <Button type="submit">بحث</Button>
    </form>
  );
}
