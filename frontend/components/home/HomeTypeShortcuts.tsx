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
    <nav aria-label="أقسام السوق" className="grid grid-cols-4 gap-2 sm:gap-3">
      {SHORTCUTS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-card px-2 py-2 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-muted/60">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
