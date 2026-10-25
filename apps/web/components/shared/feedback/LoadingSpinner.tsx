/** Compatibility facade for existing call sites; presentation lives in LoadingState. */
import { LoadingState } from '@/components/shared/feedback/LoadingState';
import type { SpinnerSize } from '@/components/ui/spinner';
import { LOADING_COPY } from '@/lib/loadingCopy';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
  overlay?: boolean;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

const SPINNER_SIZE: Record<NonNullable<LoadingSpinnerProps['size']>, SpinnerSize> = {
  sm: 'md',
  md: 'lg',
  lg: 'xl',
};

export function LoadingSpinner({
  size = 'md',
  fullPage = false,
  overlay = false,
  label = LOADING_COPY.default,
  hideLabel = false,
  className,
}: LoadingSpinnerProps) {
  return (
    <LoadingState
      variant={overlay ? 'overlay' : fullPage ? 'page' : 'inline'}
      size={SPINNER_SIZE[size]}
      label={label}
      hideLabel={hideLabel}
      spinnerClassName={className}
    />
  );
}
