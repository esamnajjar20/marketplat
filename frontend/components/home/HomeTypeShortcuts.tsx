'use client';

import Link from 'next/link';
import { Megaphone, Package, Wrench, Store } from 'lucide-react';

const SHORTCUTS = [
  { href: '/ads', label: 'إعلانات', icon: Megaphone },
  { href: '/products', label: 'منتجات', icon: Package },
  { href: '/services', label: 'خدمات', icon: Wrench },
  { href: '/stores', label: 'متاجر', icon: Store },
] as const;

export function HomeTypeShortcuts() {
  return (
    <nav aria-label="استكشف حسب النوع" className="grid grid-cols-4 gap-2 sm:gap-3">
      {SHORTCUTS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="group flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/70 bg-card/90 px-1 py-2.5 text-center text-xs font-bold text-foreground shadow-xs transition-[background-color,border-color,transform,box-shadow] duration-150 hover:border-primary/35 hover:bg-primary/[0.04] hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[4.75rem] sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15 sm:h-10 sm:w-10"><Icon className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" aria-hidden="true" /></span>
          <span className="min-w-0 truncate">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
