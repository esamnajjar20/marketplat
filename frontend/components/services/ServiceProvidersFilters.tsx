'use client';

import { LocateFixed } from 'lucide-react';
import { FEATURES } from '@/lib/featureFlags';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { cn } from '@/lib/utils';

/**
 * فلاتر مقدمي الخدمة — تصميم المرجع: مدينة + زر استخدام موقعي جنباً إلى جنب.
 */
export function ServiceProvidersFilters({
  onRequestLocation,
  showLocateCta,
}: {
  onRequestLocation?: () => void;
  showLocateCta?: boolean;
}) {
  const { city, setCity, canChange } = useBrowseCity();

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-card p-3 shadow-[0_1px_3px_rgba(42,36,29,0.06)] dark:border-border dark:bg-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <FilterCitySelect
            id="providers-filter-city"
            value={city ?? ''}
            allLabel="كل المدن / حسب موقعك"
            disabled={!canChange}
            triggerClassName="h-11 w-full rounded-full border-[var(--color-border)] bg-card text-sm font-semibold dark:border-border"
            onChange={(value) => {
              if (canChange) setCity(value || undefined);
            }}
          />
        </div>
        {FEATURES.GPS_LOCATION && showLocateCta && onRequestLocation ? (
          <button
            type="button"
            onClick={onRequestLocation}
            className={cn(
              'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 text-sm font-bold text-primary-foreground',
              'transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <LocateFixed className="h-4 w-4" aria-hidden />
            استخدام موقعي
          </button>
        ) : null}
      </div>
      {!canChange ? (
        <p className="mt-2 text-center text-2xs-tight text-muted-foreground">
          المدينة مربوطة بحسابك — غيّرها من الملف الشخصي.
        </p>
      ) : null}
    </div>
  );
}
