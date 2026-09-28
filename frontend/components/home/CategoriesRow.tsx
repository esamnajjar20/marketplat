'use client';

import Link from 'next/link';
import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { ROUTES } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';
import { cn } from '@/lib/utils';
import {
  Car, Home, Smartphone, Sofa, Briefcase, Shirt,
  Baby, Dumbbell, Wrench, PawPrint, BookOpen, Tag,
  type LucideIcon,
} from 'lucide-react';

/**
 * PLAN Phase 1 (القسم 3، البند "Categories Row" + القسم 6 "تصادم أسماء
 * التصنيفات"): يدمج 3 جداول DB مستقلة (فئات الإعلانات/المنتجات/الخدمات)
 * في صف واحد. بما أنه لا يوجد رابط في الباكند بين الجداول الثلاثة، هذا
 * المكوّن يُزيل التكرار دفاعيًا بمطابقة nameAr بعد تطبيع بسيط (trim +
 * توحيد المسافات) بدل الافتراض بعدم وجود تصادم — إن تصادم اسمان يبقى
 * أولهما ظهورًا فقط (أولوية: إعلانات ثم منتجات ثم خدمات).
 *
 * ⚠️ لم يُتحقق من العدد/الأسماء الفعلية في قاعدة بيانات حقيقية (لا
 * وصول شبكة في بيئة البناء) — هذا الدمج والـdedup مبنيان دفاعيًا على
 * افتراض أسوأ الحالات، لا على فحص فعلي. راجع القسم 5 (المرحلة 0) قبل
 * الاعتماد النهائي.
 */

const CATEGORY_ICON_RULES: Array<{ icon: LucideIcon; keywords: string[] }> = [
  { icon: Car, keywords: ['car', 'vehicle', 'auto', 'سيار', 'مركب'] },
  { icon: Home, keywords: ['real-estate', 'realestate', 'property', 'عقار', 'شقة', 'أرض', 'ارض'] },
  { icon: Smartphone, keywords: ['electronic', 'phone', 'mobile', 'إلكترون', 'الكترون', 'موبايل', 'جوال'] },
  { icon: Sofa, keywords: ['furniture', 'home-goods', 'أثاث', 'اثاث', 'منزل'] },
  { icon: Briefcase, keywords: ['job', 'work', 'career', 'وظائف', 'وظيف', 'عمل'] },
  { icon: Shirt, keywords: ['fashion', 'clothes', 'clothing', 'ملابس', 'أزياء', 'ازياء'] },
  { icon: Baby, keywords: ['baby', 'kids', 'child', 'أطفال', 'اطفال', 'مواليد'] },
  { icon: Dumbbell, keywords: ['sport', 'fitness', 'رياض'] },
  { icon: Wrench, keywords: ['service', 'repair', 'خدم', 'صيان'] },
  { icon: PawPrint, keywords: ['pet', 'animal', 'حيوان'] },
  { icon: BookOpen, keywords: ['book', 'education', 'كتب', 'تعليم'] },
];

function iconFor(slug: string, nameAr: string): LucideIcon {
  const haystack = `${slug} ${nameAr}`.toLowerCase();
  const match = CATEGORY_ICON_RULES.find((rule) => rule.keywords.some((kw) => haystack.includes(kw)));
  return match?.icon ?? Tag;
}

type SourceType = 'ad' | 'product' | 'service';

interface Item {
  id: string;
  nameAr: string;
  slug: string;
  type: SourceType;
  href: string;
}

const TYPE_BADGE: Record<SourceType, string> = {
  ad: 'bg-accent/15 text-accent',
  product: 'bg-primary/15 text-primary',
  service: 'bg-blue-500/15 text-blue-600',
};

const TYPE_LABEL: Record<SourceType, string> = {
  ad: 'إعلانات',
  product: 'منتجات',
  service: 'خدمات',
};

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** ترتيب مخلوط: 2 إعلان، 1 منتج، 1 إعلان، 1 خدمة، تكرار — يطابق الخطة الأصلية. */
function interleave(ads: Item[], products: Item[], services: Item[]): Item[] {
  const pattern: SourceType[] = ['ad', 'ad', 'product', 'ad', 'service', 'ad', 'product', 'service'];
  const queues: Record<SourceType, Item[]> = { ad: [...ads], product: [...products], service: [...services] };
  const seen = new Set<string>();
  const out: Item[] = [];
  let guard = 0;
  const total = ads.length + products.length + services.length;

  while (out.length < total && guard < total * pattern.length) {
    const want = pattern[guard % pattern.length]!;
    guard++;
    const queue = queues[want];
    while (queue.length) {
      const next = queue.shift()!;
      const key = normalize(next.nameAr);
      if (seen.has(key)) continue; // تصادم اسم — أول ظهور يفوز
      seen.add(key);
      out.push(next);
      break;
    }
  }
  return out;
}

export function CategoriesRow() {
  // Prefer categories from GET /home — only fall back if /home failed/omitted them.
  const home = useHomepage();
  const fromHome = home.data?.categories;
  const hasHomeCats = Boolean(
    fromHome && (fromHome.ads?.length || fromHome.products?.length || fromHome.services?.length),
  );
  const allowFetch = home.isError || (home.isSuccess && !hasHomeCats);

  const { data: adCats, isLoading: adLoading } = useCategories({ enabled: allowFetch });
  const { data: productCats, isLoading: productLoading } = useProductCategories({
    enabled: allowFetch,
  });
  const { data: serviceCats, isLoading: serviceLoading } = useServiceCategories({
    enabled: allowFetch,
  });

  const isLoading =
    home.isPending || (!hasHomeCats && (adLoading || productLoading || serviceLoading));

  const resolvedAdCats = fromHome?.ads ?? adCats;
  const resolvedProductCats = fromHome?.products ?? productCats;
  const resolvedServiceCats = fromHome?.services ?? serviceCats;

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  const ads: Item[] = (resolvedAdCats ?? [])
    .filter((c) => !c.parentId)
    .map((c) => ({ id: c.id, nameAr: c.nameAr, slug: c.slug, type: 'ad' as const, href: ROUTES.category(c.slug) }));

  const products: Item[] = (resolvedProductCats ?? [])
    .filter((c) => !('parentId' in c) || !c.parentId)
    .filter((c) => !('isActive' in c) || c.isActive)
    .map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      slug: c.slug,
      type: 'product' as const,
      href: `${ROUTES.search}?type=products&categoryId=${c.id}`,
    }));

  const services: Item[] = (resolvedServiceCats ?? [])
    .filter((c) => !('parentId' in c) || !c.parentId)
    .filter((c) => !('isActive' in c) || c.isActive)
    .map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      slug: c.slug,
      type: 'service' as const,
      href: `${ROUTES.search}?type=services&categoryId=${c.id}`,
    }));

  const items = interleave(ads, products, services);
  if (items.length === 0) return null;

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const Icon = iconFor(item.slug, item.nameAr);
        return (
          <Link
            key={`${item.type}-${item.id}`}
            href={item.href}
            className="inline-flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-2xl border border-border bg-card px-2 py-2.5 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="line-clamp-2 w-full text-[11px] font-medium leading-tight">
              {item.nameAr}
            </span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                TYPE_BADGE[item.type],
              )}
            >
              {TYPE_LABEL[item.type]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
