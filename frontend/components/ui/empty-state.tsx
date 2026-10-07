import * as React from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

/** Shared empty state for lists, searches, dashboards, and account sections. */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, secondaryAction, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        'flex min-h-48 w-full flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border bg-surface-1 px-[var(--space-5)] py-[var(--space-8)] text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="icon-well mb-4 h-12 w-12 rounded-[var(--radius-control)]" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
