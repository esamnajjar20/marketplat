import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Clock } from 'lucide-react';
import { HeroBanner }   from '@/components/home/HeroBanner';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { FeaturedAds }  from '@/components/home/FeaturedAds';
import { RecentAds }    from '@/components/home/RecentAds';
import { RecommendedAds } from '@/components/home/RecommendedAds';
import { ROUTES }       from '@/lib/constants';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرئيسية', path: '/' });

/**
 * Section header shared by the three grids below the hero. Each
 * section gets an eyebrow that names what the section actually is
 * (not a decorative "01/02/03" — order doesn't carry meaning here,
 * category/featured/recent are three independent entry points, not a
 * sequence), plus a hairline rule that echoes the woven-texture motif
 * in HeroBanner at a much quieter volume.
 */
function SectionHeader({
  eyebrow,
  title,
  icon,
  cta,
}: {
  eyebrow: string;
  title: string;
  icon?: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex items-end justify-between gap-3 border-b pb-3">
      <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {icon}
          {eyebrow}
        </p>
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
      </div>
      {cta && (
        <Link href={cta.href} className="shrink-0 text-sm font-medium text-primary hover:underline">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="pb-8">
      <HeroBanner />

      <section className="container mx-auto space-y-4 px-4 pt-10">
        <SectionHeader eyebrow="تصفح حسب الفئة" title="ماذا تبحث عنه؟" />
        <CategoryGrid />
      </section>

      {/*
        Featured ads get their own tinted band rather than sitting in
        plain white/cream like every other section — this is the one
        place the brand's terracotta accent (reserved elsewhere for
        small badges/borders) gets to carry a whole section, which is
        exactly what "featured" should feel like: the one section that
        looks different on purpose.
      */}
      <section className="mt-10 border-y bg-accent/[0.06] py-10">
        <div className="container mx-auto space-y-4 px-4">
          <SectionHeader
            eyebrow="مميز"
            title="إعلانات مميزة"
            icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
          />
          <FeaturedAds />
        </div>
      </section>

      <section className="container mx-auto space-y-4 px-4 pt-10">
        <SectionHeader
          eyebrow="الأحدث"
          title="أحدث الإعلانات"
          icon={<Clock className="h-3.5 w-3.5" />}
          cta={{ href: ROUTES.search, label: 'عرض الكل ←' }}
        />
        <RecentAds />
      </section>

      {/*
        Gap #9: personalized for a returning visitor (favorites/views/
        created ads), trending for everyone else. RecommendedAds owns
        its own heading and section wrapper (see its own comment) so it
        can disappear as a whole when it has nothing worth showing.
      */}
      <RecommendedAds />
    </div>
  );
}
