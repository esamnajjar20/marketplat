'use client';

/**
 * أدوات سريعة — المحفوظات والتنزيلات (بدون QR / دفع سريع).
 */
import Link from 'next/link';
import { Bookmark, Download } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function HomeQuickActions({ className }: { className?: string }) {
  return (
    <section className={cn('container mx-auto max-w-7xl px-4', className)}>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <Link
          href={ROUTES.savedPayments}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3.5 shadow-xs transition-all hover:border-primary/35 hover:shadow-sm active:scale-[0.99] sm:px-4 sm:py-4"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Bookmark className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 text-start">
            <span className="block text-sm font-bold text-foreground">المحفوظات</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">
              دفع وبطاقات على جهازك
            </span>
          </span>
        </Link>
        <Link
          href={ROUTES.downloads}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3.5 shadow-xs transition-all hover:border-primary/35 hover:shadow-sm active:scale-[0.99] sm:px-4 sm:py-4"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Download className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 text-start">
            <span className="block text-sm font-bold text-foreground">التنزيلات</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground sm:text-xs">
              كتالوجات للمتجر دون نت
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}
