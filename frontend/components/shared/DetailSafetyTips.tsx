'use client';

import { useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIPS = [
  'قابل البائع في مكان عام وآمن.',
  'تأكد من حالة السلعة قبل الدفع.',
  'لا تحوّل أموالاً مسبقاً لشخص لا تعرفه.',
] as const;

/**
 * Shared safe-buying tips for detail pages (UI-PHASE-B).
 * Open by default so safety tips are visible near the contact moment.
 */
export function DetailSafetyTips({
  className,
  defaultOpen,
}: {
  className?: string;
  /** Starts open when defaultOpen is true; defaults to open. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-muted/50',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-3 text-start sm:px-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          نصائح للسلامة
        </span>
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {TIPS.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
