/**
 * LoadingSpinner — accessible inline / full-page spinner.
 */
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
  /** طبقة شبه شفافة فوق المحتوى الحالي (حالات حفظ/تحديث) */
  overlay?: boolean;
  label?: string;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-4',
  lg: 'h-12 w-12 border-4',
} as const;

export function LoadingSpinner({
  size = 'md',
  fullPage = false,
  overlay = false,
  label = 'جارٍ التحميل…',
  className,
}: LoadingSpinnerProps) {
  const spinner = (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'animate-spin rounded-full border-primary border-t-transparent',
        SIZE_CLASSES[size],
        className,
      )}
    />
  );

  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3">
        {spinner}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
        <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2 shadow-md">
          {spinner}
          <span className="text-sm font-medium">{label}</span>
        </div>
      </div>
    );
  }

  return spinner;
}
