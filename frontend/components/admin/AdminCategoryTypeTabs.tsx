'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderTree, Package, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';

const TABS = [
  { href: ROUTES.admin.categories,        label: 'فئات الإعلانات', icon: FolderTree },
  { href: ROUTES.admin.productCategories, label: 'فئات المنتجات',  icon: Package },
  { href: ROUTES.admin.serviceCategories, label: 'فئات الخدمات',   icon: Wrench },
] as const;

/**
 * FIX P2-9: the report's complaint was that ads/products/services
 * categories live on three fully separate pages with no way to switch
 * between them without going back through the sidebar. Each of the
 * three routes stays real and independently linkable (AdminSidebar.tsx
 * still points at all three, and existing bookmarks/deep-links keep
 * working) — this just adds a shared tab strip at the top of each page
 * so switching category type is a single click instead of a sidebar
 * round-trip. Follows the same custom role="tablist" pattern
 * SearchTabs.tsx already established (no shadcn Tabs primitive is
 * installed in this project), but as real links rather than client
 * state, since each type is a genuinely distinct page/tree/create-flow.
 */
export function AdminCategoryTypeTabs() {
  const pathname = usePathname();

  return (
    <div role="tablist" aria-label="نوع الفئات" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
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
