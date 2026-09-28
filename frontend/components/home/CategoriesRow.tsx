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
 * يدمج 3 جداول فئات مستقلة (إعلانات/منتجات/خدمات) في صف واحد مرتّب بالتناوب.
 *
 * لا يوجد dedupe بالاسم بين الأنواع: مفتاح كل عنصر يتضمن نوعه، وشارة النوع
 * تفرّق بين "سيارات" إعلانات و"سيارات" منتجات. الـ dedupe القديم كان يُخفي
 * فئة منتجات/خدمات كاملة إن تطابق اسمها مع فئة إعلانات، فتصبح غير قابلة
 * للوصول من الرئيسية. التكرار يُزال داخل النوع الواحد فقط.
 */

// كلمات إنجليزية تُطابَق كـ tokens كاملة (car ≠ healthcare)، والعربية بالاحتواء.
const CATEGORY_ICON_RULES: Array<{ icon: LucideIcon; latin: string[]; arabic: string[] }> = [
  { icon: Car, latin: ['car', 'cars', 'vehicle', 'vehicles', 'auto'], arabic: ['سيار', 'مركب'] },
  { icon: Home, latin: ['real', 'estate', 'realestate', 'property', 'properties'], arabic: ['عقار', 'شقة', 'أرض', 'ارض'] },
  { icon: Smartphone, latin: ['electronic', 'electronics', 'phone', 'phones', 'mobile', 'mobiles'], arabic: ['إلكترون', 'الكترون', 'موبايل', 'جوال'] },
  { icon: Sofa, latin: ['furniture', 'home-goods'], arabic: ['أثاث', 'اثاث'] },
  { icon: Briefcase, latin: ['job', 'jobs', 'work', 'career', 'careers'], arabic: ['وظائف', 'وظيف'] },
  { icon: Shirt, latin: ['fashion', 'clothes', 'clothing'], arabic: ['ملابس', 'أزياء', 'ازياء'] },
  { icon: Baby, latin: ['baby', 'kids', 'child', 'children'], arabic: ['أطفال', 'اطفال', 'مواليد'] },
  { icon: Dumbbell, latin: ['sport', 'sports', 'fitness'], arabic: ['رياض'] },
  { icon: Wrench, latin: ['repair', 'maintenance'], arabic: ['صيان', 'إصلاح', 'اصلاح'] },
  { icon: PawPrint, latin: ['pet', 'pets', 'animal', 'animals'], arabic: ['حيوان'] },
  { icon: BookOpen, latin: ['book', 'books', 'education'], arabic: ['كتب', 'تعليم'] },
];

export function iconFor(slug: string, nameAr: string, type: SourceType = 'ad'): LucideIcon {
  const tokens = new Set(slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  // دعم المفاتيح المركبة مثل "home-goods".
  const slugLower = slug.toLowerCase();
  const arabic = nameAr;
  const match = CATEGORY_ICON_RULES.find(
    (rule) =>
      rule.latin.some((kw) => tokens.has(kw) || slugLower === kw) ||
      rule.arabic.some((kw) => arabic.includes(kw)),
  );
  if (match) return match.icon;
  // فئات الخدمات بلا تطابق: أيقونة الخدمات بدل أيقونة الوسم العامة.
  return type === 'service' ? Wrench : Tag;
}

export type SourceType = 'ad' | 'product' | 'service';

export interface Item {
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

/** يزيل التكرار داخل النوع الواحد فقط (أول ظهور يفوز). */
function dedupeWithinType(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.nameAr);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** ترتيب مخلوط: 2 إعلان، 1 منتج، 1 إعلان، 1 خدمة، تكرار — يطابق الخطة الأصلية. */
export function interleave(ads: Item[], products: Item[], services: Item[]): Item[] {
  const pattern: SourceType[] = ['ad', 'ad', 'product', 'ad', 'service', 'ad', 'product', 'service'];
  const queues: Record<SourceType, Item[]> = {
    ad: dedupeWithinType(ads),
    product: dedupeWithinType(products),
    service: dedupeWithinType(services),
  };
  const out: Item[] = [];
  const total = queues.ad.length + queues.product.length + queues.service.length;
  let guard = 0;

  while (out.length < total && guard < total * pattern.length) {
    const want = pattern[guard % pattern.length]!;
    guard++;
    const next = queues[want].shift();
    if (next) out.push(next);
  }
  return out;
}

export function CategoriesRow() {
  // Prefer categories from GET /home — only fall back if /home failed/omitted them.
  const home = useHomepage();
  const fromHome = home.data?.categories;
  // Each list is fetched on its own only if /home failed, or if the server
  // isolated a failure of just that slice (null).
  const homeSettled = home.isError || home.isSuccess;
  const needAds = home.isError || (home.isSuccess && (fromHome?.ads ?? null) === null);
  const needProducts = home.isError || (home.isSuccess && (fromHome?.products ?? null) === null);
  const needServices = home.isError || (home.isSuccess && (fromHome?.services ?? null) === null);

  const { data: adCats, isLoading: adLoading } = useCategories({ enabled: needAds });
  const { data: productCats, isLoading: productLoading } = useProductCategories({
    enabled: needProducts,
  });
  const { data: serviceCats, isLoading: serviceLoading } = useServiceCategories({
    enabled: needServices,
  });

  const isLoading =
    home.isPending ||
    (homeSettled &&
      ((needAds && adLoading) || (needProducts && productLoading) || (needServices && serviceLoading)));

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
        const Icon = iconFor(item.slug, item.nameAr, item.type);
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
