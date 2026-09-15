'use client';

/**
 * LoadingButton — يمنع الضغط المزدوج ويعرض حالة واضحة.
 */

import { forwardRef } from 'react';
import { Button, type ButtonProps } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';

export interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
  loadingText?: string;
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  function LoadingButton(
    { isLoading, loadingText, disabled, children, className, ...props },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(isLoading && 'cursor-wait', className)}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="relative h-4 w-4 shrink-0"
              aria-hidden
            >
              <span className="absolute inset-0 rounded-full border-2 border-current/25" />
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </span>
            <span>{loadingText ?? 'جارٍ التنفيذ…'}</span>
          </span>
        ) : (
          children
        )}
      </Button>
    );
  },
);
