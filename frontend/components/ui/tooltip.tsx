'use client';

/**
 * Lightweight, dependency-free tooltip.
 *
 * DESKTOP-AUDIT-01: the codebase had zero Tooltip usage anywhere —
 * icon-only buttons, truncated table cells, and disabled states had
 * no hover/focus explanation, the one interaction paradigm mouse+
 * keyboard desktop users reach for by default.
 *
 * Not built on @radix-ui/react-tooltip: it isn't in package.json
 * (unlike dialog/dropdown-menu/select, which are) and this environment
 * has no network access to add it. Pure CSS positioning + a mouse/
 * focus-driven show/hide instead, matching the a11y bar the rest of
 * components/ui holds itself to: focus-visible triggers it too (not
 * just hover), Escape dismisses it, and it's wired up via
 * role="tooltip" + aria-describedby rather than just a title attribute.
 *
 * If @radix-ui/react-tooltip is added to the project later, this file
 * can be swapped for the standard Radix Tooltip/TooltipTrigger/
 * TooltipContent/TooltipProvider API without touching call sites much
 * — the `content`/`side` props here were named to make that migration
 * easy.
 *
 * Usage:
 *   <Tooltip content="حذف الإعلان">
 *     <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button>
 *   </Tooltip>
 *
 * `children` must be a single element that accepts refs/DOM event
 * props (a Button, a Link, a plain button/span) — it's cloned with the
 * show/hide handlers merged onto whatever handlers it already has.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  /** Tooltip text/content shown on hover or keyboard focus. */
  content: React.ReactNode;
  /** A single focusable element (button, link, etc.) to attach the tooltip to. */
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'start' | 'end';
  className?: string;
  /** Delay before showing, in ms — avoids flicker on quick mouse passes. */
  delayMs?: number;
}

// start-1/2 + -translate-x-1/2 (and the end-1/2/-translate-y-1/2 pair)
// center correctly in both LTR and RTL: the 50% inset-inline point is
// the geometric center of the trigger regardless of which physical
// side "start" resolves to, and translate is a symmetric physical
// shift back by half the tooltip's own size.
const SIDE_CLASSES: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full start-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full start-1/2 mt-2 -translate-x-1/2',
  start: 'end-full top-1/2 me-2 -translate-y-1/2',
  end: 'start-full top-1/2 ms-2 -translate-y-1/2',
};

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  delayMs = 300,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = React.useId();

  const clearPendingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const show = () => {
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => setOpen(true), delayMs);
  };
  const hide = () => {
    clearPendingTimeout();
    setOpen(false);
  };

  React.useEffect(() => clearPendingTimeout, []);

  const child = React.Children.only(children) as React.ReactElement<
    React.HTMLAttributes<HTMLElement>
  >;

  const triggerProps: React.HTMLAttributes<HTMLElement> = {
    onMouseEnter: (e) => {
      child.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e) => {
      child.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e) => {
      child.props.onFocus?.(e);
      show();
    },
    onBlur: (e) => {
      child.props.onBlur?.(e);
      hide();
    },
    onKeyDown: (e) => {
      child.props.onKeyDown?.(e);
      if (e.key === 'Escape') hide();
    },
    'aria-describedby': open ? id : undefined,
  };

  return (
    <span className="relative inline-flex">
      {React.cloneElement(child, triggerProps)}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-[var(--radius-control)] border bg-foreground px-2.5 py-1.5 text-xs leading-4 text-background shadow-md animate-in fade-in-0 zoom-in-95 duration-[var(--motion-fast)]',
            SIDE_CLASSES[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
