'use client';

import { MapPin, ChevronDown } from 'lucide-react';
import { CITIES } from '@/lib/constants';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { cn } from '@/lib/utils';
import { useState } from 'react';

/** One compact, always-available browse-city control for the whole homepage. */
export function HomeContextStrip({ className }: { className?: string }) {
  const { city, setCity, isReady, source } = useBrowseCity();
  const [open, setOpen] = useState(false);

  if (!isReady) {
    return <div className={cn('container mx-auto max-w-7xl px-3 sm:px-4', className)} />;
  }

  return (
    <section
      className={cn('container mx-auto max-w-7xl px-3 sm:px-4', className)}
      aria-label="مدينة تصفح نتائج الصفحة الرئيسية"
    >
      <div className="relative flex items-center gap-2 rounded-2xl border border-border/70 bg-card/90 px-2.5 py-2 shadow-xs">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MapPin className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs-tight font-medium text-muted-foreground">عرض النتائج حسب المدينة</p>
          <p className="truncate text-sm font-bold text-foreground">
            {city ?? 'كل المدن'}
            {source === 'profile' && !city ? null : source === 'profile' ? ' · من ملفك' : ''}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          تغيير
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="اختر مدينة"
            className="absolute end-2 top-[calc(100%+0.5rem)] z-30 grid w-[min(22rem,calc(100vw-1.5rem))] grid-cols-2 gap-1.5 rounded-2xl border border-border bg-popover p-2 shadow-xl sm:grid-cols-3"
          >
            <button
              type="button"
              role="option"
              aria-selected={!city}
              onClick={() => {
                setCity(undefined);
                setOpen(false);
              }}
              className={cn(
                'rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors',
                !city ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              كل المدن
            </button>
            {CITIES.map((item) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={city === item}
                onClick={() => {
                  setCity(item);
                  setOpen(false);
                }}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors',
                  city === item ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
