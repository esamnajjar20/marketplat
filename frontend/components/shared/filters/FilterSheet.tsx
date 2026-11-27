'use client';

import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/shared/ui/Sheet';

interface FilterSheetProps {
  children: ReactNode;
  activeCount: number;
  title?: string;
  triggerLabel?: string;
}

/** Consistent mobile filter entry and bottom sheet for every browse surface. */
export function FilterSheet({
  children,
  activeCount,
  title = 'تصفية النتائج',
  triggerLabel = 'تصفية',
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full justify-center gap-2 rounded-full border-[var(--color-border)] bg-card font-bold dark:border-border dark:bg-card"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
        {activeCount > 0 ? (
          <span
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
            aria-label={`${activeCount} فلاتر نشطة`}
          >
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex max-h-[92dvh] flex-col rounded-t-3xl border-[var(--color-border)] bg-[var(--color-page)] p-0 dark:bg-background">
          <SheetHeader className="border-b border-[var(--color-border)] px-4 pb-3 pt-3 text-start dark:border-border">
            <SheetTitle className="text-base font-extrabold">{title}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {children}
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-[var(--color-border)] bg-[var(--color-page)]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm dark:border-border dark:bg-background/95">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full border-[var(--color-border)] font-bold"
              onClick={() => setOpen(false)}
            >
              إغلاق
            </Button>
            <Button
              type="button"
              className="h-11 flex-[1.4] rounded-full font-bold"
              onClick={() => setOpen(false)}
            >
              عرض النتائج{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
