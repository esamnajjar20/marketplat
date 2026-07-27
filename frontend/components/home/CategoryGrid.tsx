'use client';

import Link from 'next/link';
import { useCategories } from '@/hooks/queries/useCategories';
import { ROUTES }        from '@/lib/constants';
import { Skeleton }      from '@/components/shared/ui/Skeleton';
import {
  Car, Home, Smartphone, Sofa, Briefcase, Shirt,
  Baby, Dumbbell, Wrench, PawPrint, BookOpen, Tag,
  type LucideIcon,
} from 'lucide-react';

/**
 * FIX UX-01: every category previously rendered with the same generic
 * Tag icon — a grid meant to be scanned at a glance (cars vs. real
 * estate vs. electronics) carried zero visual distinction between its
 * items. Categories are backend-managed and dynamic, so this can't be
 * a fixed lookup by id; instead it matches on keywords likely to
 * appear in either the slug (English, backend-controlled) or the
 * Arabic display name, and falls back to Tag for anything unmatched —
 * new categories an admin adds later still render correctly, just
 * without a bespoke icon until this list is extended.
 */
const CATEGORY_ICON_RULES: Array<{ icon: LucideIcon; keywords: string[] }> = [
  { icon: Car,        keywords: ['car', 'vehicle', 'auto', 'سيار', 'مركب'] },
  { icon: Home,        keywords: ['real-estate', 'realestate', 'property', 'عقار', 'شقة', 'أرض', 'ارض'] },
  { icon: Smartphone,  keywords: ['electronic', 'phone', 'mobile', 'إلكترون', 'الكترون', 'موبايل', 'جوال'] },
  { icon: Sofa,        keywords: ['furniture', 'home-goods', 'أثاث', 'اثاث', 'منزل'] },
  { icon: Briefcase,   keywords: ['job', 'work', 'career', 'وظائف', 'وظيف', 'عمل'] },
  { icon: Shirt,       keywords: ['fashion', 'clothes', 'clothing', 'ملابس', 'أزياء', 'ازياء'] },
  { icon: Baby,        keywords: ['baby', 'kids', 'child', 'أطفال', 'اطفال', 'مواليد'] },
  { icon: Dumbbell,    keywords: ['sport', 'fitness', 'رياض'] },
  { icon: Wrench,      keywords: ['service', 'repair', 'خدم', 'صيان'] },
  { icon: PawPrint,    keywords: ['pet', 'animal', 'حيوان'] },
  { icon: BookOpen,    keywords: ['book', 'education', 'كتب', 'تعليم'] },
];

function iconFor(slug: string, nameAr: string): LucideIcon {
  const haystack = `${slug} ${nameAr}`.toLowerCase();
  const match = CATEGORY_ICON_RULES.find((rule) =>
    rule.keywords.some((kw) => haystack.includes(kw)),
  );
  return match?.icon ?? Tag;
}

export function CategoryGrid() {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  const top = (categories ?? []).filter((c) => !c.parentId).slice(0, 8);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {top.map((cat) => {
        const Icon = iconFor(cat.slug, cat.nameAr);
        return (
          <Link
            key={cat.id}
            href={ROUTES.category(cat.slug)}
            className="group flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <span className="truncate text-sm font-medium">{cat.nameAr}</span>
            {cat._count && (
              <span className="text-xs text-muted-foreground">{cat._count.ads} إعلان</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
