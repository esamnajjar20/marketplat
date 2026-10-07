import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.99] active:brightness-95 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-xs hover:bg-muted hover:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /** Soft brand tint — secondary actions that stay on-brand without solid fill */
        soft:
          'bg-primary-soft text-primary shadow-xs hover:bg-primary-soft/80',
        /** Terracotta CTA — featured / high-emphasis marketing actions */
        brand:
          'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 hover:shadow-md',
      },
      size: {
        // FIX BTN-TOUCH-01: primary CTAs meet 44px (WCAG AAA / Apple HIG).
        // sm/icon stay at 40px (WCAG AA needs 24px only) — 70 admin/layout
        // usages plus manual h-8/h-9 overrides rely on the denser size.
        default: 'min-h-[var(--control-height)] px-4 py-2',
        sm: 'min-h-[var(--control-height-sm)] rounded-md px-3 text-xs',
        lg: 'min-h-[var(--control-height-lg)] rounded-md px-8 text-base',
        icon: 'h-[var(--touch-target)] w-[var(--touch-target)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
