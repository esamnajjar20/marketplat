import { type ReactNode, type ReactElement, useId, isValidElement, cloneElement } from 'react';
import { type LucideIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthFieldProps {
  label: string;
  htmlFor: string;
  icon: LucideIcon;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Password fields: put icon on the physical left to avoid collision with eye toggle. */
  iconOnLeft?: boolean;
  children: ReactElement<Record<string, unknown>>;
}

/**
 * حقل مصادقة — تسمية أعلى الحقل + أيقونة داخل الحقل + حالة خطأ وردية.
 */
export function AuthField({
  label,
  htmlFor,
  icon: Icon,
  error,
  hint,
  required,
  iconOnLeft,
  children,
}: AuthFieldProps) {
  const uid = useId();
  const errorId = error ? `${uid}-error` : undefined;
  const hintId = hint && !error ? `${uid}-hint` : undefined;
  const describedBy = errorId ?? hintId;

  const styledChild = isValidElement(children)
    ? cloneElement(children, {
        className: cn(
          'h-12 rounded-2xl border bg-card shadow-none transition-colors',
          'placeholder:text-[var(--legacy-muted-soft)]',
          error
            ? 'border-[var(--legacy-danger-border-strong)] bg-[var(--legacy-danger-surface)] focus-visible:ring-[var(--legacy-danger-strong)]/25'
            : 'border-[var(--legacy-border)] focus-visible:ring-[var(--legacy-primary)]/25',
          iconOnLeft ? 'pe-11 ps-4' : 'ps-11 pe-4',
          (children.props as { className?: string }).className,
        ),
        'aria-describedby':
          (children.props as { ['aria-describedby']?: string })['aria-describedby'] ?? describedBy,
        'aria-invalid':
          (children.props as { ['aria-invalid']?: boolean })['aria-invalid'] ??
          (error ? true : undefined),
      })
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm-tight font-bold text-[var(--legacy-ink)]">
        {label}
        {required && (
          <>
            <span className="ms-1 text-[var(--legacy-danger-strong)]" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(مطلوب)</span>
          </>
        )}
      </label>
      <div className="relative">
        <Icon
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2',
            error ? 'text-[var(--legacy-danger-strong)]/70' : 'text-[var(--legacy-muted-soft)]',
            iconOnLeft ? 'end-4' : 'start-4',
          )}
        />
        {styledChild}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-[var(--legacy-muted-text)]">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--legacy-danger)]"
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
