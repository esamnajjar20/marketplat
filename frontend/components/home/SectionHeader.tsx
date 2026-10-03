import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  cta?: { href: string; label: string };
  badge?: ReactNode;
  /**
   * Visual role of the section:
   * - default: organic browse rails
   * - featured: paid / highlighted
   * - personal: for-you / recommendations
   * - nearby: location-aware
   */
  tone?: 'default' | 'featured' | 'personal' | 'nearby';
  className?: string;
}

const EYEBROW: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-muted-foreground',
  featured: 'text-accent',
  personal: 'text-primary',
  nearby: 'text-brand-nearby dark:text-brand-nearby-foreground',
};

export function SectionHeader({
  eyebrow,
  title,
  icon,
  cta,
  badge,
  tone = 'default',
  className,
}: Props) {
  const featured = tone === 'featured';

  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0 space-y-1">
        <p
          className={cn(
            'flex items-center gap-1.5 text-2xs font-semibold',
            EYEBROW[tone],
          )}
        >
          {icon}
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h2
            className={cn(
              'font-bold tracking-tight text-foreground',
              featured ? 'text-lg sm:text-xl' : 'text-base sm:text-lg',
            )}
          >
            {title}
          </h2>
          {badge}
        </div>
      </div>
      {cta && (
        <Link
          href={cta.href}
          // FIX RSC-PREFETCH-STORM-02: every home section renders this CTA,
          // each prefetching its own /search?type=… page on load.
          prefetch={false}
          aria-label={`عرض كل ${title}`}
          className={cn(
            'inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] sm:min-h-0 sm:px-2.5 sm:py-1',
            featured
              ? 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15'
              : tone === 'nearby'
                ? 'border-brand-nearby/25 bg-brand-nearby/10 text-brand-nearby-foreground hover:bg-brand-nearby/15 dark:text-brand-nearby-foreground'
                : tone === 'personal'
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border/80 bg-card text-muted-foreground hover:border-primary/30 hover:text-primary',
          )}
        >
          {cta.label.replace(/\s*←\s*$/, '').replace(/^عرض الكل/, 'الكل') || cta.label}
          <ChevronLeft className="h-3.5 w-3.5 opacity-70" aria-hidden />
        </Link>
      )}
    </div>
  );
}
