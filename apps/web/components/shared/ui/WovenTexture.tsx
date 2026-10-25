import { cn } from '@/lib/utils';

interface Props {
  /** Matches each call site's previous inline opacity — 0.07 everywhere
   *  except /search, which used 0.06. Kept as a prop instead of a 
   *  value so that difference stays visible and intentional at each
   *  call site, not silently unified into one number. */
  opacity: 0.06 | 0.07;
  className?: string;
}

/**
 * VISUAL-3: the repeating-linear-gradient "woven texture" band was
 * defined inline, byte-for-byte identical, in four places — HeroBanner,
 * both the desktop sidebar and mobile top bar of (auth)/layout.tsx, and
 * /search's header band. All four are the same decorative overlay over
 * a solid `bg-primary` block: absolutely positioned, full-bleed,
 * aria-hidden, using `currentColor` so it inherits primary-foreground
 * from its parent without needing its own color prop. Extracted here so
 * the pattern is defined once; the four call sites now just pick their
 * own opacity. Per VISUAL_DESIGN_PLAN.md §3: this is a code-dedup move,
 * not a visual change, and is deliberately capped at these known
 * "brand + page-start" locations — not something to reach for on every
 * new colored band without at least 4 more genuinely matching cases.
 */
export function WovenTexture({ opacity, className }: Props) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        opacity,
        backgroundImage:
          'repeating-linear-gradient(135deg, currentColor 0, currentColor 1px, transparent 1px, transparent 14px)',
      }}
    />
  );
}
