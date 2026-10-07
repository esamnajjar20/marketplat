import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('desktop-page-header', 'gap-3 sm:gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="desktop-page-header__icon" aria-hidden>{icon}</div> : null}
        <div className="min-w-0 space-y-1">
          {eyebrow ? <p className="text-xs font-semibold text-primary">{eyebrow}</p> : null}
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
