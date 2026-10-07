'use client';

import { cn } from '@/lib/utils';

export interface FormStepItem {
  id: string;
  label: string;
  description?: string;
}

interface Props {
  steps: FormStepItem[];
  /** 0-based active step index */
  current: number;
  className?: string;
  /** Optional click to jump to a previous step only */
  onStepClick?: (index: number) => void;
  /** Accessible name for the wizard's <nav> — defaults to a generic label; callers with a more specific context (e.g. "خطوات نشر الإعلان") should override it. */
  navLabel?: string;
}

/**
 * Lightweight step indicator for long create/edit forms.
 * Visual only + optional jump-back; does not manage form state.
 */
export function FormSteps({ steps, current, className, onStepClick, navLabel = 'خطوات النموذج' }: Props) {
  return (
    <nav aria-label={navLabel} className={cn('w-full', className)}>
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const clickable = Boolean(onStepClick) && index < current;
          return (
            <li key={step.id} className="relative flex flex-1 sm:min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(index)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex min-h-12 w-full items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 text-start transition-[background-color,border-color,box-shadow,transform] duration-[var(--motion-normal)]',
                  active && 'border-primary/40 bg-primary-soft shadow-xs',
                  done && !active && 'border-border bg-card hover:border-primary/25',
                  !done && !active && 'border-border/70 bg-muted/30 opacity-80',
                  clickable && 'cursor-pointer hover:-translate-y-px hover:shadow-xs active:translate-y-0',
                  !clickable && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    active && 'bg-primary text-primary-foreground',
                    done && !active && 'bg-primary/15 text-primary',
                    !done && !active && 'bg-muted text-muted-foreground',
                  )}
                  aria-hidden
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm font-medium leading-tight',
                      active ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                      {step.description}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
