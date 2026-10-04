import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for public browse pages (/ads, /products, /services, /stores, …).
 * UI-PHASE-A: one header + toolbar + optional desktop sidebar + main column.
 */
export interface ListPageShellProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** Filters sheet, sort bar, chips — sits under the header. */
  toolbar?: ReactNode;
  /** Desktop-only filters column (hidden below lg). */
  sidebar?: ReactNode;
  /** Optional action on the header row (e.g. related directory link). */
  headerEnd?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Consistent product/ad/search card grid on browse pages. */
export const LIST_CARD_GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5';

/** Store directory cards (horizontal layout — fewer columns). */
export const LIST_STORE_GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5';

/** Service listing cards. */
export const LIST_SERVICE_GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5';

export function ListPageShell({
  icon,
  title,
  description,
  toolbar,
  sidebar,
  headerEnd,
  children,
  className,
}: ListPageShellProps) {
  const titleId = `list-page-title-${title.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`;

  return (
    <div
      className={cn(
        'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-8',
        className,
      )}
    >
      <header className="border-b border-border/70 bg-surface-1/95 shadow-[0_1px_0_hsl(var(--border)/0.35)]">
        <div className="container mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:min-h-24 lg:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              {icon}
            </div>
            <div className="min-w-0">
              <h1 id={titleId} className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-[1.65rem]">
                {title}
              </h1>
              {description ? (
                <p className="mt-0.5 text-pretty text-xs text-muted-foreground sm:text-sm">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {headerEnd}
        </div>
      </header>

      <div className="container mx-auto max-w-7xl space-y-4 px-3 pt-4 sm:space-y-6 sm:px-4 sm:pt-6 lg:pt-7" aria-labelledby={titleId}>
        {toolbar ? (
          <div className="desktop-toolbar flex flex-wrap items-center gap-2" role="toolbar" aria-label={`أدوات ${title}`}>{toolbar}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-7">
          {sidebar ? (
            <aside className="hidden lg:col-span-1 lg:block">
              <div className="sticky top-24 space-y-4">{sidebar}</div>
            </aside>
          ) : null}
          <div className={cn(sidebar ? 'lg:col-span-3' : 'lg:col-span-4', 'min-w-0')}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
