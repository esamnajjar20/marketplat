'use client';

/**
 * LoadingButton — زر يعرض حالة الإرسال ويمنع الضغط المزدوج.
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
        className={cn(className)}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden
            />
            <span>{loadingText ?? 'جارٍ التنفيذ…'}</span>
          </span>
        ) : (
          children
        )}
      </Button>
    );
  },
);
