import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Spinner — المؤشر الدوّار الوحيد في المشروع.
 *
 * - يرث لون النص (currentColor): داخل زر primary يظهر فاتحاً، وداخل نص خافت يظهر خافتاً.
 * - افتراضياً زخرفي (aria-hidden). مرّر `label` فقط عندما يكون هو الإعلان الوحيد للحالة.
 * - قوس الدوران يحمل `animate-spin` (تعتمد عليه الاختبارات الحالية) ويتوقف مع prefers-reduced-motion.
 */
const SIZES = {
  xs: { box: 'h-3.5 w-3.5', border: 'border-[1.5px]' },
  sm: { box: 'h-4 w-4', border: 'border-2' },
  md: { box: 'h-6 w-6', border: 'border-2' },
  lg: { box: 'h-9 w-9', border: 'border-[3px]' },
  xl: { box: 'h-12 w-12', border: 'border-4' },
} as const;

export type SpinnerSize = keyof typeof SIZES;

export interface SpinnerProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  size?: SpinnerSize;
  /** عند تمريره يصبح المؤشر role="status" ويُقرأ لقارئ الشاشة. */
  label?: string;
}

function Spinner({ size = 'sm', label, className, ...props }: SpinnerProps) {
  const { box, border } = SIZES[size];
  return (
    <span
      className={cn('relative inline-block shrink-0 align-middle', box, className)}
      {...(label ? { role: 'status' } : { 'aria-hidden': true })}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-0 rounded-full border-current opacity-20', border)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 animate-spin rounded-full border-current border-l-transparent border-t-transparent motion-reduce:animate-none',
          border,
        )}
        style={{ animationDuration: '0.85s' }}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export { Spinner };
