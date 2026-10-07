'use client';
import { Badge, type BadgeProps } from '@/components/shared/ui/Badge';

export type StatusBadgeTone = NonNullable<BadgeProps['variant']>;

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: string;
  labels?: Record<string, string>;
  tone?: StatusBadgeTone;
}

export function StatusBadge({ status, labels, tone = 'outline', ...props }: StatusBadgeProps) {
  return <Badge variant={tone} {...props}>{labels?.[status] ?? status}</Badge>;
}
