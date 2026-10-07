import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for protected account surfaces (messages, notifications,
 * favorites, my-ads, settings). UI-
 */
export function AccountPageShell({
  title,
  description,
  actions,
  children,
  className,
  /** Extra bottom space for sticky composers (chat). */
  tallBottom,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tallBottom?: boolean;
}) {
  return (
    <div
      className={cn(
        tallBottom
          ? 'pb-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:pb-10'
          : 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-10',
        className,
      )}
    >
      <header className="border-b border-border/70 bg-surface-1/90 shadow-[0_1px_0_hsl(var(--border)/0.3)]">
        <div className="container mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:min-h-20 sm:px-4 sm:py-4 lg:min-h-22 lg:py-5">
          <div className="min-w-0">
            <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <div className="container mx-auto w-full max-w-7xl px-3 pt-4 sm:px-4 sm:pt-6 lg:pt-7">{children}</div>
    </div>
  );
}
