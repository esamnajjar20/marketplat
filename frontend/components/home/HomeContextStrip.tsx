'use client';

/**
 * Homepage context strip (Phase UI-HOME-01):
 * one compact row — city filter + live activity — instead of separate
 * HomeCityChips + HomeTrustStrip blocks competing for above-the-fold space.
 */
import { MapPin } from 'lucide-react';
import { CITIES } from '@/lib/constants';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { cn } from '@/lib/utils';

const nf = new Intl.NumberFormat('ar-EG');

export function HomeContextStrip({ className }: { className?: string }) {
  const { city, canChange, setCity, isReady, source } = useBrowseCity();
  const stats = useHomepage().data?.stats;

  const activityLabel = (() => {
    if (!stats || stats.activeAds <= 0) return null;
    if (stats.adsLast24h > 0) return `+${nf.format(stats.adsLast24h)} اليوم`;
    return `${nf.format(stats.activeAds)} إعلان نشط`;
  })();

  if (!isReady && !activityLabel) return null;

  return (
    <section
      className={cn('container mx-auto max-w-7xl px-3 sm:px-4', className)}
      aria-label="المدينة ونشاط السوق"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border border-border/70 bg-card/80 px-2.5 py-2 shadow-xs sm:gap-x-3 sm:px-3">
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="sr-only sm:not-sr-only">المدينة</span>
        </span>

        {!isReady ? (
          <span className="h-7 w-24 animate-pulse rounded-full bg-muted" aria-hidden />
        ) : !canChange ? (
          city ? (
            <span className="text-xs font-semibold text-foreground">
              {city}
              {source === 'profile' ? (
                <span className="ms-1 font-normal text-muted-foreground">· من ملفك</span>
              ) : null}
            </span>
          ) : null
        ) : (
          <div
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="اختر مدينة لتصفية النتائج"
          >
            <button
              type="button"
              aria-pressed={!city}
              onClick={() => setCity(undefined)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]',
                !city
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/80 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
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
                  aria-pressed={selected}
                  onClick={() => setCity(selected ? undefined : c)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97]',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border/80 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {activityLabel ? (
          <span
            className="ms-auto shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary sm:text-xs"
            title="نشاط الإعلانات"
          >
            {activityLabel}
          </span>
        ) : null}
      </div>
    </section>
  );
}
