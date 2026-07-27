/**
 * Logo — the brand mark.
 *
 * FIX UX-01: previously just plain text with no visual identity — a
 * <span> in the default font weight, indistinguishable from any other
 * heading on the page. The mark now pairs a small glyph with the
 * wordmark: a rounded square carrying a stylised "س" (the first letter
 * of سوق, "market") cut on an angle — a simple, legible reference to
 * an open stall/awning rather than a literal illustration, so it reads
 * clearly at 24px in a header as well as larger on the auth panel.
 *
 * Accepts a variant prop for the auth panel's light-on-dark version.
 */
import { APP_NAME } from '@/lib/constants';
import { cn }       from '@/lib/utils';

interface LogoProps {
  variant?: 'default' | 'light';
  className?: string;
}

export function Logo({ variant = 'default', className }: LogoProps) {
  const isLight = variant === 'light';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-sans text-base font-bold',
          isLight ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
        )}
      >
        س
      </span>
      <span
        className={cn(
          'font-sans text-xl font-bold tracking-tight',
          isLight ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {APP_NAME}
      </span>
    </span>
  );
}
