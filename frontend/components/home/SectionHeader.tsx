import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  eyebrow: string;
  title: string;
  icon?: ReactNode;
  cta?: { href: string; label: string };
  badge?: ReactNode;
  /** featured = stronger accent treatment for hero-ish sections */
  tone?: 'default' | 'featured';
  className?: string;
}

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
    <div
      className={cn(
        'flex items-end justify-between gap-3 border-b pb-3',
        featured ? 'border-accent/25' : 'border-border/70',
        className,
      )}
    >
      <div className="space-y-1">
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider',
            featured ? 'text-accent' : 'text-muted-foreground',
          )}
        >
          {icon}
          {eyebrow}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h2
            className={cn(
              'font-bold tracking-tight',
              featured ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl',
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
          className={cn(
            'shrink-0 text-sm font-semibold underline-offset-4 transition-colors hover:underline',
            featured ? 'text-accent hover:text-accent/90' : 'text-primary hover:text-primary/80',
          )}
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
