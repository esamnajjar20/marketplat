'use client';

import { MapPin } from 'lucide-react';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { cn } from '@/lib/utils';

/**
 * Shows the active browse city on list/search results so filters feel grounded.
 * UI-
 */
export function BrowseCityHint({ className }: { className?: string }) {
  const { city, isReady, source } = useBrowseCity();
  if (!isReady || !city) return null;

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span>
        النتائج في <span className="font-semibold text-foreground">{city}</span>
        {source === 'profile' ? <span className="text-muted-foreground"> · من ملفك</span> : null}
      </span>
    </p>
  );
}
