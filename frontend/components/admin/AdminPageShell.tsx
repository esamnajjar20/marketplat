import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for admin table/dashboard pages.
 * Matches the provided design: plain title + subtitle, actions on the side.
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
    <div className={cn('mx-auto w-full max-w-[1600px] space-y-4 sm:space-y-5 lg:space-y-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-balance text-[22px] font-extrabold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-pretty text-[13px] leading-5 text-muted-foreground">
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
