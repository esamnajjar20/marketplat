import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        // FIX UX-01: previously hover:bg-accent hover:text-accent-foreground
        // — correct under shadcn's stock palette, where --accent is a
        // neutral near-white tint meant exactly for subtle hover states.
        // Now that --accent carries the brand terracotta (a deliberate,
        // high-visibility color reserved for the "featured" signature
        // and CTA accents), reusing it here would make every outline/
        // ghost button flash bright orange on hover — hover:bg-muted
        // keeps the original subtle-tint behavior these variants are
        // meant to have.
        outline:
          'border border-input bg-background shadow-sm hover:bg-muted hover:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        // FIX P1-13: h-8 (32px) is below the ~44px touch target
        // recommended by WCAG 2.5.5/Apple HIG/Material — kept the same
        // visual density (text-xs, tight padding) but added invisible
        // hit-area padding via a pseudo-expanded tap target isn't
        // available here without a wrapper, so the safer fix is
        // growing the box itself to the same 40px floor `icon` now
        // uses below, matching what call sites needing sm buttons in
        // tight rows (tables, action bars) already reach for.
        sm: 'h-10 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        // FIX P1-13: default icon buttons were h-9 w-9 (36px), under
        // the ~44px touch-target guideline; several call sites
        // (MyAdsList, MyProductsList, MyServiceListingsList row
        // actions) were already manually overriding to h-10 w-10 via
        // className for exactly this reason. Raising the base size to
        // match removes the need for that per-call override and fixes
        // every other icon button that didn't think to add one.
        icon: 'h-10 w-10',
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
