'use client';

import Link from 'next/link';
import { useCategoryItems } from '@/hooks/queries/useCategoryItems';
import { ROUTES } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import { LayoutGrid } from 'lucide-react';
import { iconFor, TYPE_LABEL, type SourceType } from '@/lib/categoryItems';

/**
 * يدمج 3 جداول فئات مستقلة (إعلانات/منتجات/خدمات) في صف واحد مرتّب بالتناوب.
 *
 * لا يوجد dedupe بالاسم بين الأنواع: مفتاح كل عنصر يتضمن نوعه، وشارة النوع
 * تفرّق بين "سيارات" إعلانات و"سيارات" منتجات. التكرار يُزال داخل النوع
 * الواحد فقط. المنطق المشترك في lib/categoryItems + hooks/queries/useCategoryItems؛
 * و"كل الفئات" يفتح فهرساً كاملاً في /categories (الصف مقصوص على 24).
 */

// إعادة تصدير للتوافق مع من يستورد من هذا الملف (الاختبارات).
export { iconFor, interleave } from '@/lib/categoryItems';
export type { Item, SourceType } from '@/lib/categoryItems';

const TYPE_BADGE: Record<SourceType, string> = {
  ad: 'bg-accent/15 text-accent',
  product: 'bg-primary/15 text-primary',
  service: 'bg-blue-500/15 text-blue-600',
};

/** Root categories on the homepage (mobile-first). Full index via "كل الفئات". */
export const MAX_HOME_CATEGORIES = 10;

export function CategoriesRow() {
  const { items: all, isLoading } = useCategoryItems();

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  if (all.length === 0) return null;
  const items = all.slice(0, MAX_HOME_CATEGORIES);

  return (
    <div className="-mx-3 flex gap-2 overflow-x-auto overscroll-x-contain touch-pan-x px-3 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-4 sm:px-4">
      {items.map((item) => {
        const Icon = iconFor(item.slug, item.nameAr, item.type);
        return (
          <Link
            key={`${item.type}-${item.id}`}
            href={item.href}
            className="inline-flex min-h-[4.5rem] w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-1.5 py-2 text-center shadow-xs transition-all active:scale-[0.97] hover:border-primary/40 sm:w-20 sm:py-2.5 sm:hover:-translate-y-0.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary sm:h-11 sm:w-11">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight sm:text-xs">
              {item.nameAr}
            </span>
            <span
              className={cn(
                'hidden rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none sm:inline sm:text-[11px]',
                TYPE_BADGE[item.type],
              )}
            >
              {TYPE_LABEL[item.type]}
            </span>
          </Link>
        );
      })}
      <Link
        href={ROUTES.categories}
        className="inline-flex min-h-[4.5rem] w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card px-1.5 py-2 text-center transition-all active:scale-[0.97] hover:border-primary/40 sm:w-20 sm:py-2.5 sm:hover:-translate-y-0.5"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground sm:h-11 sm:w-11">
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </span>
        <span className="line-clamp-2 w-full text-xs font-medium leading-tight">كل الفئات</span>
      </Link>
    </div>
  );
}
