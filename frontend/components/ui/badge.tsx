import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-xs hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/80',
        success:
          'border-transparent bg-success text-success-foreground shadow-xs hover:bg-success/80',
        warning:
          'border-transparent bg-warning text-warning-foreground shadow-xs hover:bg-warning/80',
        /** Featured / promoted — terracotta */
        accent:
          'border-transparent bg-accent text-accent-foreground shadow-xs hover:bg-accent/80',
        /** Soft tints — low-noise status chips on dense UIs */
        soft:
          'border-transparent bg-primary-soft text-primary',
        'soft-success':
          'border-transparent bg-success-soft text-success',
        'soft-warning':
          'border-transparent bg-warning-soft text-warning-foreground',
        'soft-accent':
          'border-transparent bg-accent-soft text-accent',
        outline: 'text-foreground border-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
