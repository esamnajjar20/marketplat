'use client';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
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
 * sidebar round-trip. This is route navigation, so it uses a labelled nav
 * with aria-current rather than the content-tab interaction pattern.
 *
 * ADMIN-HUB-01: the three used to be separate pages and this component read
 * usePathname() to find the active route. The admin hub now passes `active`
 * explicitly, so no router hooks are needed here.
 */
export function AdminCategoryTypeTabs({ active }: { active: CategoryTypeTab }) {
  return (
    <nav aria-label="نوع الفئات" className="flex gap-1 overflow-x-auto overscroll-x-contain border-b">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <IntentPrefetchLink
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )} prefetch={false}
          >
            <tab.icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </IntentPrefetchLink>
        );
      })}
    </nav>
  );
}
