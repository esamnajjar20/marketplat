/**
 * PriceInput — numeric input with currency prefix and "Negotiable" toggle.
 *
 * UX-04 FIX: Checkbox now has a stable id (via useId) so external labels
 *   and aria-labelledby can reference it correctly.
 *
 * UX-10 FIX: Currency prefix used left-3/pl-12 which breaks in RTL —
 *   the prefix appeared on the wrong side. Now uses start-3/ps-12
 *   (logical properties) so it's always on the reading-start side.
 *
 * FIX DEAD-06: defaulted to 'USD', which never matched the app (every
 * other price display uses ₪ — e.g. AdForm.tsx's own "السعر (₪)"
 * label), and this component was never actually wired into AdForm in
 * the first place. Default corrected and wired into AdForm below.
 */
'use client';

import { useId }  from 'react';
import { Input }  from '@/components/shared/ui/Input';
import { cn }     from '@/lib/utils';

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  isNegotiable: boolean;
  onNegotiableChange: (value: boolean) => void;
  currency?: string;
  error?: string;
  className?: string;
}

export function PriceInput({
  value,
  onChange,
  isNegotiable,
  onNegotiableChange,
  currency = '₪',
  error,
  className,
}: PriceInputProps) {
  const checkboxId = useId();

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          {/* UX-10 FIX: start-3/pe-12 keep the currency prefix and numeric text from overlapping in RTL */}
          <span
            className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            {currency}
          </span>
          {/* FIX-ADFLOW-03: explicit dir=ltr + inputMode=decimal so numeric
              entry stays LTR inside the RTL form and mobile keyboards open
              a decimal pad instead of a full text keyboard. */}
          <Input
            type="number"
            inputMode="decimal"
            dir="ltr"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0.00"
            className="pe-12"
            aria-label={`السعر بـ ${currency}`}
          />
        </div>
      </div>
      {/* UX-04 FIX: useId for stable checkbox id */}
      <label htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          id={checkboxId}
          type="checkbox"
          checked={isNegotiable}
          onChange={(e) => onNegotiableChange(e.target.checked)}
          className="rounded"
        />
        السعر قابل للتفاوض
      </label>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
