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
 *
 * UX-FIX P2-11: the render-prop form above was never actually used by any
 * of FormField's ~10 consumers — every call site passed a plain static
 * child instead (e.g. `<FormField ...><Input .../></FormField>`), so
 * errorId/hintId never reached a real DOM element and no input anywhere
 * in the app had aria-describedby/aria-invalid wired up. Rather than
 * rewrite every call site to adopt the render-prop syntax (10 files,
 * ~50+ fields, real risk of missing one), FormField now auto-clones a
 * single element child with those attributes when the child doesn't
 * already set them explicitly. A few fields (e.g. a textarea with a
 * character-count <p> beside it) pass more than one child element —
 * cloning isn't safe/meaningful there, so those are left untouched,
 * same as before this fix.
 */
import { type ReactNode, type ReactElement, useId, isValidElement, cloneElement, Children } from 'react';
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
  const describedBy = errorId ?? hintId;

  let renderedChildren: ReactNode;
  if (typeof children === 'function') {
    // Caller opted into the explicit render-prop form — respect it as-is.
    renderedChildren = children({ errorId, hintId });
  } else {
    const childArray = Children.toArray(children);
    // Only auto-wire when there's exactly one real element to attach
    // attributes to (skips multi-child fields like a textarea + counter,
    // where cloning the whole group wouldn't target the actual input).
    if (childArray.length === 1 && isValidElement(childArray[0])) {
      const onlyChild = childArray[0] as ReactElement<Record<string, unknown>>;
      renderedChildren = cloneElement(onlyChild, {
        'aria-describedby': onlyChild.props['aria-describedby'] ?? describedBy,
        'aria-invalid': onlyChild.props['aria-invalid'] ?? (error ? true : undefined),
      });
    } else {
      renderedChildren = children;
    }
  }

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

      {renderedChildren}

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
