import * as React from 'react';
import { cn } from '@/lib/utils';

interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, htmlFor, hint, error, required, children, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-[var(--space-2)]', className)} {...props}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium leading-5 text-foreground">
          {label}
          {required ? <span className="ms-1 text-destructive" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-sm leading-5 text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  ),
);
Field.displayName = 'Field';

export { Field };
