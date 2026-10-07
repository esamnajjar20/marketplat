import { Badge, type BadgeProps } from './badge';
import { cn } from '@/lib/utils';

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  tone?: StatusTone;
}

const toneVariant: Record<StatusTone, NonNullable<BadgeProps['variant']>> = {
  neutral: 'secondary',
  info: 'soft',
  success: 'soft-success',
  warning: 'soft-warning',
  danger: 'destructive',
  accent: 'soft-accent',
};

/** Semantic status chip; keeps color semantics consistent across the app. */
function StatusBadge({ tone = 'neutral', className, ...props }: StatusBadgeProps) {
  return <Badge variant={toneVariant[tone]} className={cn('rounded-full', className)} {...props} />;
}

export { StatusBadge, type StatusBadgeProps, type StatusTone };
