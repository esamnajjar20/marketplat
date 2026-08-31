import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?:        ReactNode;
  title:        string;
  description?: string;
  action?:      ReactNode;
  className?:   string;
}

/**
 * Empty / error placeholder — soft primary icon well + calm hierarchy.
 * Uses design-system tokens (primary-soft) so empty states match the rest
 * of the branded UI instead of a one-off grey circle.
 */
export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-16 text-center section-enter',
        className,
      )}
    >
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-xs [&_svg]:h-8 [&_svg]:w-8">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-base font-semibold tracking-tight text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
