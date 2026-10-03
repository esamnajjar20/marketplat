'use client';

import { LocateFixed, SlidersHorizontal } from 'lucide-react';
import { CITIES } from '@/lib/constants';
import { FEATURES } from '@/lib/featureFlags';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { Button } from '@/components/shared/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';

/**
 * Lightweight filters for /service-providers.
 * API supports city only (ServiceProvidersQuery) — no category/price on providers.
 * City is applied via browse-city (same cascade as the directory hook).
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
    <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية
      </div>

      <div className="space-y-1.5">
        <label htmlFor="providers-filter-city" className="text-xs font-medium text-muted-foreground">
          المدينة
        </label>
        <Select
          value={city || 'ALL'}
          onValueChange={(v) => {
            if (!canChange) return;
            setCity(v === 'ALL' ? undefined : v);
          }}
          disabled={!canChange}
        >
          <SelectTrigger id="providers-filter-city" className="w-full">
            <SelectValue placeholder="كل المدن" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن / حسب موقعك</SelectItem>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!canChange ? (
          <p className="text-2xs text-muted-foreground">
            المدينة مربوطة بحسابك — غيّرها من الملف الشخصي.
          </p>
        ) : null}
      </div>

      {FEATURES.GPS_LOCATION && showLocateCta && onRequestLocation ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={onRequestLocation}
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          استخدام موقعي
        </Button>
      ) : null}
    </div>
  );
}
