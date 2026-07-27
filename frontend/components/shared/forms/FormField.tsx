/**
 * FormField — labelled input wrapper compatible with React Hook Form.
 * Renders: label, input slot, error message, optional hint.
 *
 * UX-03 FIX: Passes errorId/hintId to children via render prop so the input
 *   can set aria-describedby and aria-invalid. Screen readers will now
 *   announce the error when the input receives focus.
 *
 * UX-11 FIX: Required star uses ms-1 (logical margin) instead of ml-1
 *   so it appears correctly in both LTR and RTL layouts.
 */
import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label:     string;
  htmlFor:   string;
  error?:    string;
  hint?:     string;
  required?: boolean;
  children:  ReactNode | ((ids: { errorId?: string; hintId?: string }) => ReactNode);
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FormFieldProps) {
  const uid     = useId();
  const errorId = error ? `${uid}-error` : undefined;
  const hintId  = hint && !error ? `${uid}-hint` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {/* UX-11 FIX: ms-1 is logical (RTL-safe) instead of ml-1 */}
        {required && <span className="ms-1 text-destructive" aria-hidden="true">*</span>}
        {/* Hidden text for screen readers — the * is marked aria-hidden */}
        {required && <span className="sr-only">(required)</span>}
      </label>

      {/* UX-03 FIX: Pass IDs to children so inputs can wire aria-describedby */}
      {typeof children === 'function'
        ? children({ errorId, hintId })
        : children}

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );
}
