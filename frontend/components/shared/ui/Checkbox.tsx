'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Checkbox — plain native <input type="checkbox"> styled to match the
 * rest of the UI kit, rather than pulling in @radix-ui/react-checkbox
 * (not currently a dependency — see package.json). A row-selection
 * checkbox has no need for Radix's indeterminate/animation machinery;
 * native semantics (keyboard, screen reader) are already correct.
 *
 * BULK-ADMIN (item 17): first consumer is the row/select-all checkboxes
 * in AdminReportsTable — written here in shared/ui so the same
 * component covers the remaining admin tables as bulk actions extend
 * to them, instead of each table re-styling its own checkbox.
 */
export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 rounded border border-input accent-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
