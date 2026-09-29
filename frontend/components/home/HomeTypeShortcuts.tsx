'use client';

/**
 * Four primary marketplace entry points — ads / products / services / stores.
 * Sits under paid featured content so the next tap is intentional browsing.
 */
import Link from 'next/link';
import { Tag, ShoppingBag, Wrench, Store } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const ITEMS = [
  {
    href: ROUTES.ads,
    label: 'إعلانات',
    hint: 'مبوب',
    icon: Tag,
    className: 'bg-accent/15 text-accent',
  },
  {
    href: ROUTES.products,
    label: 'منتجات',
    hint: 'متاجر',
    icon: ShoppingBag,
    className: 'bg-primary/15 text-primary',
  },
  {
    href: ROUTES.services,
    label: 'خدمات',
    hint: 'قريبة',
    icon: Wrench,
    className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  {
    href: ROUTES.stores,
    label: 'متاجر',
    hint: 'موثوقة',
    icon: Store,
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  },
] as const;

export function HomeTypeShortcuts({ className }: { className?: string }) {
  return (
    <section
      className={cn('container mx-auto max-w-7xl px-3 sm:px-4', className)}
      aria-label="تصفح حسب النوع"
    >
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {ITEMS.map(({ href, label, hint, icon: Icon, className: iconClass }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="group flex min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-2xl border border-border/70 bg-card px-1 py-2 text-center shadow-xs transition-all hover:border-primary/35 hover:shadow-sm active:scale-[0.97] sm:min-h-0 sm:gap-1.5 sm:px-1.5 sm:py-3"
          >
            <span
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl transition-colors sm:h-11 sm:w-11',
                iconClass,
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-[11px] font-bold leading-tight text-foreground sm:text-sm">
              {label}
            </span>
            <span className="hidden text-[10px] text-muted-foreground sm:block">{hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
