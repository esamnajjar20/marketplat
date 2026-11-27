'use client';

import { Input } from '@/components/shared/ui/Input';
import { FilterField } from './FilterField';

interface FilterPriceRangeFieldsProps {
  minId: string;
  maxId: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onMinCommit?: (value: string) => void;
  onMaxCommit?: (value: string) => void;
  title?: string;
  minLabel?: string;
  maxLabel?: string;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}

/** Shared two-ended numeric price input; callers retain control of update timing. */
export function FilterPriceRangeFields({
  minId,
  maxId,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  onMinCommit,
  onMaxCommit,
  title = 'السعر',
  minLabel = 'من',
  maxLabel = 'إلى',
  minPlaceholder = '0',
  maxPlaceholder = 'بدون حد',
}: FilterPriceRangeFieldsProps) {
  return (
    <FilterField label={title}>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={minId} className="text-xs text-muted-foreground">{minLabel}</label>
          <Input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            dir="ltr"
            value={minValue}
            onChange={(event) => onMinChange(event.target.value)}
            onBlur={(event) => onMinCommit?.(event.target.value)}
            placeholder={minPlaceholder}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={maxId} className="text-xs text-muted-foreground">{maxLabel}</label>
          <Input
            id={maxId}
            type="number"
            inputMode="numeric"
            min={0}
            dir="ltr"
            value={maxValue}
            onChange={(event) => onMaxChange(event.target.value)}
            onBlur={(event) => onMaxCommit?.(event.target.value)}
            placeholder={maxPlaceholder}
          />
        </div>
      </div>
    </FilterField>
  );
}
