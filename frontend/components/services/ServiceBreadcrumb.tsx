'use client';

import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';
import { ROUTES } from '@/lib/constants';

interface Props {
  title: string;
  categoryName?: string | null;
  // Accepted but not currently read. The caller in
  // app/(public)/services/[id]/page.tsx still passes it — keeping
  // the prop here (optional) preserves that contract and allows the
  // category name to eventually link to /services?categoryId=...
  // without a second plumbing pass through every caller.
  categoryId?: string | null;
}

/**
 * مسار التصفح لصفحة الخدمة — نفس الاسم والبنية المستخدمة في
 * AdBreadcrumb ("مسار التصفح") و ProductDetailSection.
 */
export function ServiceBreadcrumb({ title, categoryName }: Props) {
  return (
    <nav
      aria-label="مسار التصفح"
      className="mb-4 flex items-center gap-1.5 overflow-x-auto text-sm text-muted-foreground"
    >
      <Link href={ROUTES.home} className="flex shrink-0 items-center gap-1 hover:text-primary">
        <Home className="h-3.5 w-3.5" />
        الرئيسية
      </Link>
      <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <Link href={ROUTES.services} className="shrink-0 hover:text-primary">
        الخدمات
      </Link>
      {categoryName && (
        <>
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">{categoryName}</span>
        </>
      )}
      <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate text-foreground/80">{title}</span>
    </nav>
  );
}
