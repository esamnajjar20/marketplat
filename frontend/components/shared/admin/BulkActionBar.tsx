'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';

interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Sticky bulk toolbar for admin tables — matches design: soft green bar.
 */
export function BulkActionBar({
  selectedCount,
  onClear,
  children,
  className,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="إجراءات جماعية"
      className={cn(
        'sticky top-0 z-10 flex flex-wrap items-center gap-2.5 rounded-[10px] border border-[#CFE0D5]',
        'bg-[#E8F1EC] px-3 py-2 text-[13px] font-extrabold text-[#1F4D33]',
        className,
      )}
    >
      <span className="tabular-nums">
        {selectedCount} محدد
      </span>
      <div className="flex flex-wrap items-center gap-2 ms-auto">
        {children}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 min-h-8 text-[#1F4D33] hover:bg-white/60"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5 me-1" aria-hidden />
          إلغاء التحديد
        </Button>
      </div>
    </div>
  );
}
