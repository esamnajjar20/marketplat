'use client';

import { LocateFixed } from 'lucide-react';
import { CITIES } from '@/lib/constants';
import { FEATURES } from '@/lib/featureFlags';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';
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
    <div className="rounded-2xl border border-[#EAE3D6] bg-white p-3 shadow-[0_1px_3px_rgba(42,36,29,0.06)] dark:border-border dark:bg-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Select
            value={city || 'ALL'}
            onValueChange={(v) => {
              if (!canChange) return;
              setCity(v === 'ALL' ? undefined : v);
            }}
            disabled={!canChange}
          >
            <SelectTrigger
              id="providers-filter-city"
              className="h-11 w-full rounded-full border-[#EAE3D6] bg-white text-sm font-semibold dark:border-border"
            >
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
        </div>
        {FEATURES.GPS_LOCATION && showLocateCta && onRequestLocation ? (
          <button
            type="button"
            onClick={onRequestLocation}
            className={cn(
              'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#397F56] px-4 text-sm font-bold text-white',
              'transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <LocateFixed className="h-4 w-4" aria-hidden />
            استخدام موقعي
          </button>
        ) : null}
      </div>
      {!canChange ? (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          المدينة مربوطة بحسابك — غيّرها من الملف الشخصي.
        </p>
      ) : null}
    </div>
  );
}
