import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for admin table/dashboard pages (UI-PHASE-F).
 * Dense desktop-first layout — not for the consumer mobile app.
 */
export function AdminPageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1600px] space-y-4 lg:space-y-5', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <h1 className="text-balance text-xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-pretty text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
