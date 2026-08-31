'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCategories } from '@/hooks/queries/useCategories';
import { ROUTES }        from '@/lib/constants';
import { Skeleton }      from '@/components/shared/ui/Skeleton';
import { Button }        from '@/components/shared/ui/Button';
import { ApiError }      from '@/components/shared/ApiError';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

/**
 * VISUAL (mobile top-bar redesign): a fixed rotation of theme-token
 * background/text pairs (not raw Tailwind colors) for the mobile pill
 * row, matching the reference layout's colorful chip look. Every pair
 * is a semantic token rather than e.g. bg-blue-500, so each pill's
 * contrast is whatever that token already resolves to in light vs.
 * dark mode — no separate dark-mode pill palette needed. Cycles by
 * index so it stays stable regardless of how many categories the
 * backend returns.
 *
 * FIX UI-REVIEW-1: success/destructive dropped from this rotation.
 * Those two tokens carry a fixed meaning everywhere else in the app
 * (ad-status badges, form validation, StatusBadge.tsx) — a category
 * landing on "destructive" red purely by array-index luck (e.g.
 * "خدمات" or "وظائف") reads as an error/warning state, not a neutral
 * category chip. Kept to brand-neutral tokens only.
 */
const PILL_COLOR_ROTATION = [
  'bg-primary/15 text-primary',
  'bg-accent/15 text-accent',
  'bg-warning/20 text-warning-foreground',
  'bg-muted-foreground/15 text-muted-foreground',
] as const;

export function CategoryGrid() {
  const { data: categories, isLoading, isError, error, refetch } = useCategories();

  if (isLoading) {
    return (
      <>
        <div className="flex gap-2 overflow-x-auto sm:hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="hidden grid-cols-3 gap-3 sm:grid md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  // FIX UI-REVIEW-ERROR-STATE: previously `(categories ?? []).filter(...)`
  // swallowed a failed request the same way as a genuinely-empty
  // category list — both rendered an empty grid with zero explanation.
  // Reported symptom: on a flaky/dead connection, the whole home page
  // silently went blank section by section (this one included) with
  // no error shown anywhere and no way to retry short of a full reload.
  // Distinguishing isError here means a network failure now says so.
  if (isError) {
    return <ApiError error={error} onRetry={refetch} variant="inline" />;
  }

  const all = (categories ?? []).filter((c) => !c.parentId);
  return <CategoryGridContent categories={all} />;
}

/**
 * FIX UX-GAP-06: both the mobile pill row and the desktop grid used to
 * `.slice(0, 8)` unconditionally with no signal that more categories
 * existed. On desktop the wide grid made 8 look complete; on mobile
 * the same cap hid entries behind a horizontal-scroll row with no
 * visible cue that anything was missing. Mobile now scrolls through
 * every top-level category (the row was already a horizontal-scroll
 * affordance — the cap was actively fighting its own UI pattern).
 * Desktop shows the first 8 and reveals the rest via an inline
 * expand/collapse toggle rather than linking to a "view all
 * categories" page, since no such route exists yet in this app.
 */
const DESKTOP_INITIAL_COUNT = 8;

function CategoryGridContent({ categories }: { categories: NonNullable<ReturnType<typeof useCategories>['data']> }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? categories : categories.slice(0, DESKTOP_INITIAL_COUNT);
  const hasMore = categories.length > DESKTOP_INITIAL_COUNT;

  return (
    <>
      {/* Mobile: horizontal-scroll colorful pills, matching the
          reference layout ("ماذا تبحث عنه؟" chip row). Shows every
          top-level category — the row already scrolls, so nothing
          needs to be capped or hidden here. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden [&::-webkit-scrollbar]:hidden">
        {categories.map((cat, i) => {
          const Icon = iconFor(cat.slug, cat.nameAr);
          return (
            <Link
              key={cat.id}
              href={ROUTES.category(cat.slug)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap shadow-xs transition-opacity hover:opacity-90 ${PILL_COLOR_ROTATION[i % PILL_COLOR_ROTATION.length]}`}
            >
              <Icon className="h-3.5 w-3.5 opacity-90" aria-hidden />
              {cat.nameAr}
            </Link>
          );
        })}
      </div>

      {/* Desktop/tablet: icon-card grid, expandable past the initial 8. */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 xl:grid-cols-6 stagger-fade-in">
          {visible.map((cat) => {
            const Icon = iconFor(cat.slug, cat.nameAr);
            return (
              <Link
                key={cat.id}
                href={ROUTES.category(cat.slug)}
                className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary-soft/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        {hasMore && (
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (
                <>عرض أقل <ChevronUp className="h-4 w-4" /></>
              ) : (
                <>عرض كل الفئات ({categories.length}) <ChevronDown className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
