/**
 * LoadingSpinner — مؤشر تحميل بحجم قسم/صفحة (يلفّ الـ Spinner الموحّد).
 * للمؤشر الصغير داخل الأزرار والنصوص استخدم <Spinner /> أو <Button loading />.
 */
import { Spinner, type SpinnerSize } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
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
  // إعلان واحد فقط لقارئ الشاشة: role=status على المؤشر نفسه،
  // والنص المرئي المجاور aria-hidden حتى لا يُقرأ مرتين.
  const spinner = <Spinner size={SPINNER_SIZE[size]} label={label} className={cn('text-primary', className)} />;
  const visibleLabel = !hideLabel;

  if (fullPage) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
        {spinner}
        {visibleLabel && (
          <p aria-hidden="true" className="text-sm font-medium text-muted-foreground">
            {label}
          </p>
        )}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
        <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-5 py-3 shadow-lg">
          {spinner}
          {visibleLabel && (
            <span aria-hidden="true" className="text-sm font-semibold text-foreground">
              {label}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (hideLabel) return spinner;

  return (
    <div className="inline-flex items-center gap-2.5">
      {spinner}
      <span aria-hidden="true" className="text-sm text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
