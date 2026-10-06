import {
  Car, Home, Smartphone, Sofa, Briefcase, Shirt,
  Baby, Dumbbell, Wrench, PawPrint, BookOpen, Tag,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '@/lib/constants';

/**
 * Shared category-chip model used by the homepage row and the /categories
 * index page. The three category tables (ads / products / services) are
 * independent on the backend; this normalises them into one `Item` shape.
 */

export type SourceType = 'ad' | 'product' | 'service';

export interface Item {
  id: string;
  nameAr: string;
  slug: string;
  type: SourceType;
  href: string;
}

export const TYPE_LABEL: Record<SourceType, string> = {
  ad: 'إعلانات',
  product: 'منتجات',
  service: 'خدمات',
};

// ── Icons ─────────────────────────────────────────────────────────

// كلمات إنجليزية تُطابَق كـ tokens كاملة (car ≠ healthcare)، والعربية تُطابَق
// من بداية الكلمة (بعد إزالة "ال" التعريف) — لا بالاحتواء، وإلا طابقت "ارض"
// كلمة "معارض" فأخذت أيقونة العقارات.
const CATEGORY_ICON_RULES: Array<{ icon: LucideIcon; latin: string[]; arabic: string[] }> = [
  { icon: Car, latin: ['car', 'cars', 'vehicle', 'vehicles', 'auto'], arabic: ['سيار', 'مركب'] },
  { icon: Home, latin: ['real', 'estate', 'realestate', 'property', 'properties'], arabic: ['عقار', 'شق', 'ارض', 'اراض'] },
  { icon: Smartphone, latin: ['electronic', 'electronics', 'phone', 'phones', 'mobile', 'mobiles'], arabic: ['الكترون', 'موبايل', 'جوال'] },
  { icon: Sofa, latin: ['furniture', 'home-goods'], arabic: ['اثاث'] },
  { icon: Briefcase, latin: ['job', 'jobs', 'work', 'career', 'careers'], arabic: ['وظيف'] },
  { icon: Shirt, latin: ['fashion', 'clothes', 'clothing'], arabic: ['ملابس', 'ازياء'] },
  { icon: Baby, latin: ['baby', 'kids', 'child', 'children'], arabic: ['اطفال', 'مواليد'] },
  { icon: Dumbbell, latin: ['sport', 'sports', 'fitness'], arabic: ['رياض'] },
  { icon: Wrench, latin: ['repair', 'maintenance'], arabic: ['صيان', 'اصلاح'] },
  { icon: PawPrint, latin: ['pet', 'pets', 'animal', 'animals'], arabic: ['حيوان'] },
  { icon: BookOpen, latin: ['book', 'books', 'education'], arabic: ['كتب', 'تعليم'] },
];

/**
 * يوحّد الهمزات ويحذف التشكيل، ويُرجع كل كلمة بصيغتين: كما هي وبلا "ال"
 * التعريف (الصيغتان معاً لأن "الكترونيات" تبدأ بـ "ال" أصلية في الكلمة).
 */
function arabicWords(name: string): string[] {
  return name
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .split(/[\s/،,\-–—]+/)
    .filter(Boolean)
    .flatMap((w) => (w.startsWith('ال') && w.length > 3 ? [w, w.slice(2)] : [w]));
}

export function iconFor(slug: string, nameAr: string, type: SourceType = 'ad'): LucideIcon {
  const tokens = new Set(slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  // دعم المفاتيح المركبة مثل "home-goods".
  const slugLower = slug.toLowerCase();
  const words = arabicWords(nameAr);
  const match = CATEGORY_ICON_RULES.find(
    (rule) =>
      rule.latin.some((kw) => tokens.has(kw) || slugLower === kw) ||
      rule.arabic.some((kw) => words.some((w) => w.startsWith(kw))),
  );
  if (match) return match.icon;
  // فئات الخدمات بلا تطابق: أيقونة الخدمات بدل أيقونة الوسم العامة.
  return type === 'service' ? Wrench : Tag;
}

// ── Building / ordering ───────────────────────────────────────────

function normalize(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function dedupeWithinType(items: Item[]): Item[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.nameAr);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

interface CategoryLike {
  id: string;
  nameAr: string;
  slug: string;
  parentId?: string | null;
  isActive?: boolean;
}

/** Root (parentless) active categories → typed items with the right href. */
export function toCategoryItems(
  type: SourceType,
  categories: ReadonlyArray<CategoryLike> | null | undefined,
): Item[] {
  return (categories ?? [])
    .filter((c) => !c.parentId)
    .filter((c) => c.isActive === undefined || c.isActive)
    .map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      slug: c.slug,
      type,
      href:
        type === 'ad'
          ? ROUTES.category(c.slug)
          : `${ROUTES.search}?type=${type === 'product' ? 'products' : 'services'}&categoryId=${c.id}`,
    }));
}
