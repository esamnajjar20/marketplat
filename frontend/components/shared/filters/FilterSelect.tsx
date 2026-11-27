'use client';

import { FilterField } from './FilterField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';

export interface FilterSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly FilterSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  allLabel?: string;
  allValue?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** One accessible select-field implementation for every filter surface. */
export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
  allLabel,
  allValue = 'ALL',
  disabled = false,
  onOpenChange,
}: FilterSelectProps) {
  return (
    <FilterField id={id} label={label}>
      <Select
        value={value || allValue}
        disabled={disabled}
        onOpenChange={onOpenChange}
        onValueChange={(next) => onChange(next === allValue ? '' : next)}
      >
        <SelectTrigger id={id} className="h-10 w-full">
          <SelectValue placeholder={placeholder ?? allLabel ?? 'الكل'} />
        </SelectTrigger>
        <SelectContent>
          {allLabel ? <SelectItem value={allValue}>{allLabel}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}
