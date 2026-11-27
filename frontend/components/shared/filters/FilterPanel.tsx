import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterPanelProps {
  children: ReactNode;
  title?: string;
  headerAction?: ReactNode;
  className?: string;
  showTitle?: boolean;
}

/** Shared desktop filter-panel shell used by public browse pages. */
export function FilterPanel({
  children,
  title = 'تصفية النتائج',
  headerAction,
  className,
  showTitle = true,
}: FilterPanelProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'space-y-4 rounded-2xl border border-[var(--color-border)] bg-card p-4 dark:border-border dark:bg-card',
        className,
      )}
    >
      {showTitle || headerAction ? (
        <div className="flex min-h-6 items-center justify-between gap-3">
          {showTitle ? (
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{title}</span>
            </div>
          ) : null}
          {headerAction}
        </div>
      ) : null}
      {children}
    </section>
  );
}
