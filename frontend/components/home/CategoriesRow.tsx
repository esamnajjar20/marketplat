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

/** Root categories shown on the homepage; the rest are one tap away via "كل الفئات". */
export const MAX_HOME_CATEGORIES = 24;

export function CategoriesRow() {
  const { items: all, isLoading } = useCategoryItems();

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  if (all.length === 0) return null;
  const items = all.slice(0, MAX_HOME_CATEGORIES);

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const Icon = iconFor(item.slug, item.nameAr, item.type);
        return (
          <Link
            key={`${item.type}-${item.id}`}
            href={item.href}
            className="inline-flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl border border-border bg-card px-2 py-2.5 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="line-clamp-2 w-full text-xs font-medium leading-tight">
              {item.nameAr}
            </span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
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
        className="inline-flex w-20 shrink-0 flex-col items-center gap-1 rounded-2xl border border-dashed border-border bg-card px-2 py-2.5 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground">
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </span>
        <span className="line-clamp-2 w-full text-xs font-medium leading-tight">كل الفئات</span>
      </Link>
    </div>
  );
}
