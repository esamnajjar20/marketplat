'use client';

import { CITIES } from '@/lib/constants';
import { FilterField } from './FilterField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';

interface FilterCitySelectProps {
  id: string;
  value: string;
  onChange: (city: string) => void;
  label?: string;
  allLabel?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

/** One city selector for services, ads, products, and cross-market search. */
export function FilterCitySelect({
  id,
  value,
  onChange,
  label = 'المدينة',
  allLabel = 'كل المدن',
  disabled = false,
  triggerClassName,
}: FilterCitySelectProps) {
  return (
    <FilterField id={id} label={label}>
      <Select
        value={value || 'ALL'}
        disabled={disabled}
        onValueChange={(next) => onChange(next === 'ALL' ? '' : next)}
      >
        <SelectTrigger id={id} className={triggerClassName ?? 'h-10 w-full'}>
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">{allLabel}</SelectItem>
          {CITIES.map((city) => (
            <SelectItem key={city} value={city}>
              {city}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}
