'use client';

import Link from 'next/link';
import { useCategoryItems } from '@/hooks/queries/useCategoryItems';
import { iconFor, TYPE_LABEL, type SourceType } from '@/lib/categoryItems';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { ROUTES } from '@/lib/constants';

const SECTIONS: Array<{ type: SourceType; title: string; hint: string }> = [
  { type: 'ad', title: 'فئات الإعلانات', hint: 'بيع وشراء واستئجار بين الأفراد' },
  { type: 'product', title: 'فئات المنتجات', hint: 'منتجات المتاجر' },
  { type: 'service', title: 'فئات الخدمات', hint: 'خدمات ومقدمو خدمات' },
];

/**
 * فهرس كل فئات الجذر مجمّعة حسب النوع. الوجهة تختلف حسب النوع لأن فئات
 * المنتجات والخدمات ليس لها صفحات slug: تفتح البحث مفلتراً بالفئة.
 */
export function CategoriesIndex() {
  const { byType, isLoading } = useCategoryItems();
  const total = byType.ad.length + byType.product.length + byType.service.length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-busy="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (total === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        تعذّر تحميل الفئات الآن. حاول مرة أخرى بعد قليل، أو{' '}
        <Link href={ROUTES.search} className="font-semibold text-primary underline-offset-2 hover:underline">
          ابحث مباشرة
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {SECTIONS.filter(({ type }) => byType[type].length > 0).map(({ type, title, hint }) => (
        <section key={type} aria-labelledby={`cat-${type}`} className="space-y-3">
          <div className="space-y-0.5">
            <h2 id={`cat-${type}`} className="text-lg font-bold">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {byType[type].map((item) => {
              const Icon = iconFor(item.slug, item.nameAr, item.type);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-label={`${item.nameAr} — ${TYPE_LABEL[item.type]}`}
                    className="flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3 active:scale-[0.98] sm:gap-2 sm:py-3.5 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="line-clamp-2 text-xs font-medium leading-tight">{item.nameAr}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
