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
        'flex items-end justify-between gap-3',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p
          className={cn(
            'flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider',
            featured ? 'text-accent' : 'text-muted-foreground',
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
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            featured
              ? 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15'
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
