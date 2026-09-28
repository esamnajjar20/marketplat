'use client';

import { MapPin } from 'lucide-react';
import { CITIES } from '@/lib/constants';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { cn } from '@/lib/utils';

/**
 * Quick city filter on the homepage. When the user has a profile city,
 * shows a read-only indicator. Guests pick chips → home:browseCity.
 */
export function HomeCityChips() {
  const { city, canChange, setCity, isReady, source } = useBrowseCity();

  if (!isReady) return null;

  if (!canChange) {
    if (!city) return null;
    return (
      <div className="container mx-auto max-w-7xl px-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          عرض نتائج{' '}
          <span className="font-semibold text-foreground">{city}</span>
          {source === 'profile' ? (
            <span className="text-muted-foreground">· من ملفك</span>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl px-4">
      <div className="flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
          المدينة
        </span>
        <div
          className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="listbox"
          aria-label="اختر مدينة لتصفية النتائج"
        >
          <button
            type="button"
            role="option"
            aria-selected={!city}
            onClick={() => setCity(undefined)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              !city
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            الكل
          </button>
          {CITIES.map((c) => {
            const selected = city === c;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => setCity(selected ? undefined : c)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
