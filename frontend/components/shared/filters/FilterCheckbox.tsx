'use client';

import { Checkbox } from '@/components/shared/ui/Checkbox';

interface FilterCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Shared toggle row used for boolean filter flags. */
export function FilterCheckbox({ checked, onChange, children, disabled, className }: FilterCheckboxProps) {
  return (
    <label className={className ?? 'flex cursor-pointer items-center gap-2 text-sm'}>
      <Checkbox checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
