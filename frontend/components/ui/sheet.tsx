import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useVisualViewportMetrics } from '@/hooks/useVisualViewportHeight';

/**
 * FIX P1-2: a bottom-anchored counterpart to Dialog.tsx — same
 * @radix-ui/react-dialog primitive (already a dependency, no new
 * package needed), same Portal/Overlay/focus-trap/Escape-to-close
 * behavior, just slid in from the bottom edge and capped at a max
 * height instead of centered. Built for SearchFiltersSheet, but not
 * specific to it — any mobile bottom-panel use case can reuse this.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetPortal = DialogPrimitive.Portal;
const SheetClose = DialogPrimitive.Close;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, style, children, ...props }, ref) => {
  // FIX UX-KEYBOARD-01: max-h-[85vh] alone doesn't shrink when the
  // mobile keyboard opens (see useVisualViewportHeight's own comment
  // for why `vh` doesn't track this). Once visualViewport is
  // available, cap the sheet to 85% of the *actual visible* height
  // instead — this recalculates live as the keyboard opens/closes, so
  // a field near the top of the sheet (e.g. StoresFilters' search
  // input, the first focusable element in every filter sheet) stays
  // above the keyboard instead of sliding behind it. Falls back to the
  // static Tailwind class via maxHeight: undefined until the API
  // reports a value (SSR / first paint).
  const viewport = useVisualViewportMetrics();

  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        style={{
          ...(viewport != null
            ? {
                maxHeight: viewport.height * 0.92,
                // ارفع اللوحة فوق الكيبورد بدل أن تبقى تحته
                bottom: viewport.keyboardOffset,
              }
            : undefined),
          ...style,
        }}
        className={cn(
          // pwa-safe-bottom: same iOS/Android gesture-bar safe area as
          // BottomNav — this panel's own bottom edge needs it too since
          // it's anchored below any fixed bottom nav that might be
          // hidden behind it while open (visually it covers BottomNav,
          // so this only matters for the panel's own padding).
          'pwa-safe-bottom fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[var(--radius-modal)] border-t bg-background shadow-lg duration-[var(--motion-normal)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          className,
        )}
        {...props}
      >
        {/* Drag-handle affordance — purely visual, signals "this is a
            sheet" the way the centered Dialog's chrome already signals
            "this is a modal". */}
        <div className="mx-auto mt-2 h-1 w-12 shrink-0 rounded-full bg-muted" aria-hidden="true" />
        {children}
        <DialogPrimitive.Close className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-muted data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">إغلاق</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('shrink-0 space-y-1.5 px-4 pb-3 pt-4 text-center sm:text-start', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('shrink-0 flex flex-col gap-2 border-t px-4 py-3 sm:flex-row', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetClose,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
