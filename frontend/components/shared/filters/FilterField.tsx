import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FilterFieldProps {
  label: string;
  children: ReactNode;
  id?: string;
  className?: string;
}

/** Consistent label spacing and typography for all filter controls. */
export function FilterField({ label, id, children, className }: FilterFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {id ? (
        <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      ) : (
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
      )}
      {children}
    </div>
  );
}
