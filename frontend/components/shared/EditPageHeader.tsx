'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface Props {
  /** Where the back link goes — the owner's own list page. */
  backTo: string;
  /** Label shown next to the back arrow (e.g. "الإعلانات"). */
  backLabel: string;
  /** The page's own <h1> text (e.g. "تعديل الإعلان"). */
  title: string;
}

/**
 * shared header for the app's three "edit my X" pages
 * (my-ads/[id]/edit, my-services/[id]/edit, my-store/products/[id]/edit).
 * Each previously rendered a bare <h1> with no way back except the
 * browser's own back button — no link, no breadcrumb — despite being
 * three levels deep in the app (list → detail/ownership check → edit
 * form) and all three sharing useOwnershipGuard already.
 *
 * AdBreadcrumb (components/ads/AdBreadcrumb.tsx) was considered instead
 * of a new component, but it's purpose-built for the public ad detail
 * page's category hierarchy (home → category → ad title) — these three
 * pages don't have or need a category trail, only a single link back to
 * the owner's own list, so a lighter dedicated header fits better than
 * stretching AdBreadcrumb to a shape it wasn't designed for.
 */
export function EditPageHeader({ backTo, backLabel, title }: Props) {
  return (
    <div className="mb-6 space-y-3">
      <Link
        href={backTo}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-sm text-muted-foreground transition-[background-color,color] duration-[var(--motion-fast)] hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowRight className="h-4 w-4" />
        {backLabel}
      </Link>
      <h1 className="text-[length:var(--font-size-page-title)] font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
