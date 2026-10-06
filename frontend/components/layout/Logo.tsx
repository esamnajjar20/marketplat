/**
 * Logo — the brand mark.
 *
 * previously just plain text with no visual identity — a
 * <span> in the default font weight, indistinguishable from any other
 * heading on the page. The mark now pairs a small glyph with the
 * wordmark: a rounded square carrying a stylised "س" (the first letter
 * of سوق, "market") cut on an angle — a simple, legible reference to
 * an open stall/awning rather than a literal illustration, so it reads
 * clearly at 24px in a header as well as larger on the auth panel.
 *
 * Accepts a variant prop for the auth panel's light-on-dark version.
 *
 * VISUAL (mobile top-bar redesign): the glyph now carries a subtle
 * primary→accent gradient instead of a flat primary fill, giving the
 * mark more presence as the sole brand element in the new compact
 * mobile title bar. Both colors are theme tokens (--primary/--accent),
 * so the gradient re-derives itself from the active palette and stays
 * correct in dark mode without a separate dark-mode gradient. A `size`
 * prop lets the mobile top bar render a slightly smaller mark without
 * duplicating this component.
 */
import { APP_NAME } from '@/lib/constants';
import { cn }       from '@/lib/utils';

interface LogoProps {
  variant?: 'default' | 'light';
  size?: 'default' | 'sm';
  className?: string;
}

export function Logo({ variant = 'default', size = 'default', className }: LogoProps) {
  const isLight = variant === 'light';
  const isSmall = size === 'sm';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl font-sans font-bold shadow-sm',
          isSmall ? 'h-8 w-8 text-sm' : 'h-9 w-9 text-base',
          isLight
            ? 'bg-primary-foreground text-primary'
            : 'bg-gradient-to-br from-primary to-accent text-primary-foreground',
        )}
      >
        س
      </span>
      <span
        className={cn(
          'font-sans font-bold tracking-tight',
          isSmall ? 'text-base' : 'text-xl',
          isLight ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {APP_NAME}
      </span>
    </span>
  );
}
