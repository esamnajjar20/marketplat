import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for protected account surfaces (messages, notifications,
 * favorites, my-ads, settings). UI-PHASE-C.
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
      <header className="border-b border-border/60 bg-secondary/30">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-3 py-4 sm:px-4 sm:py-5">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </header>
      <div className="container mx-auto px-3 pt-4 sm:px-4 sm:pt-6">{children}</div>
    </div>
  );
}
