'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';

interface BulkActionBarProps {
  /** Number of currently selected rows. Bar renders nothing at 0 (caller can also choose not to mount it). */
  selectedCount: number;
  onClear: () => void;
  /** Action buttons — e.g. <Button onClick={...}>حل المحدد</Button>. */
  children: ReactNode;
}

/**
 * BulkActionBar (item 17) — the sticky-ish bar that appears above an
 * admin table once at least one row is selected, showing the count and
 * the batch actions available for the current view. Shared so the same
 * bar/behavior is reused as bulk actions extend from AdminReportsTable
 * to the other five admin tables, rather than each table rolling its
 * own count/clear UI.
 *
 * Deliberately renders null at selectedCount === 0 so callers can
 * mount it unconditionally right above their table without an extra
 * guard at each call site.
 */
export function BulkActionBar({ selectedCount, onClear, children }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="إجراءات جماعية"
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2"
    >
      <span className="text-sm font-medium">{selectedCount} محدد</span>
      <div className="flex flex-wrap items-center gap-2 ms-auto">
        {children}
        <Button variant="ghost" size="sm" className="h-7" onClick={onClear}>
          <X className="h-3.5 w-3.5 me-1" />
          إلغاء التحديد
        </Button>
      </div>
    </div>
  );
}
