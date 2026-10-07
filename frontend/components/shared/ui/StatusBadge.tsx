import type { ReactNode } from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneVariant: Record<StatusTone, BadgeProps['variant']> = {
  neutral: 'soft',
  info: 'secondary',
  success: 'soft-success',
  warning: 'soft-warning',
  danger: 'destructive',
};

interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
  size?: BadgeProps['size'];
  className?: string;
  icon?: ReactNode;
}

/** Semantic status chip used across marketplace/admin surfaces. */
export function StatusBadge({
  children,
  tone = 'neutral',
  size = 'sm',
  className,
  icon,
}: StatusBadgeProps) {
  return (
    <Badge
      size={size}
      variant={toneVariant[tone]}
      className={cn('gap-1.5 whitespace-nowrap', className)}
    >
      {icon}
      {children}
    </Badge>
  );
}
