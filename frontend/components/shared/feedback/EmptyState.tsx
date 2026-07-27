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
 * FIX UX-01: the icon previously rendered flat, at 50% muted opacity —
 * functional but visually inert, identical to every other "nothing to
 * see here" pattern. Wrapping it in a soft primary-tinted circle
 * matches the same warm, branded treatment now used for category icons
 * (CategoryGrid) instead of a one-off grey treatment unique to this component.
 */
export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center gap-3', className)}>
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium text-base">{title}</p>
        {description && <p className="text-sm text-muted-foreground max-w-xs mx-auto">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
