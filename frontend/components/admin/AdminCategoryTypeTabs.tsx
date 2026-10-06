'use client';

import Link from 'next/link';
import { FolderTree, Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';

const TABS = [
  { id: 'categories', href: ROUTES.admin.categories, label: 'فئات الإعلانات', icon: FolderTree },
  { id: 'product-categories', href: ROUTES.admin.productCategories, label: 'فئات المنتجات', icon: Package },
  { id: 'service-categories', href: ROUTES.admin.serviceCategories, label: 'فئات الخدمات', icon: Wrench },
] as const;

export type CategoryTypeTab = (typeof TABS)[number]['id'];

/**
 * ads / products / services categories each have their own tree and
 * create-flow; this strip switches between them in one click instead of a
 * sidebar round-trip. Follows the same custom role="tablist" pattern
 * SearchTabs.tsx established (no shadcn Tabs primitive is installed).
 *
 * ADMIN-HUB-01: the three used to be separate pages and this component read
 * usePathname() to find its active tab. They are tabs of /admin now, so the
 * hub passes `active` explicitly — no router hooks needed here.
 */
export function AdminCategoryTypeTabs({ active }: { active: CategoryTypeTab }) {
  return (
    <div role="tablist" aria-label="نوع الفئات" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
