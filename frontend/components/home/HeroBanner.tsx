'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { SearchBar } from '@/components/layout/SearchBar';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { ExploreSheet } from '@/components/layout/ExploreSheet';

/**
 * Hero الرئيسية.
 * زر الإضافة يفتح CreateSheet (إعلان / منتج / خدمة) — نفس سلوك زر +
 * في BottomNav على الموبايل، بدل الرابط المباشر لـ /ads/create فقط.
 */
export function HeroBanner() {
  const [createOpen, setCreateOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

  return (
    <section className="relative overflow-hidden px-4 py-6 sm:bg-primary sm:py-20 sm:text-primary-foreground">
      {/* Mobile: inset card — brand + CTA only (search lives in header). */}
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground sm:hidden">
        <WovenTexture opacity={0.07} />
        <div className="relative space-y-3 text-right">
          <span className="inline-block rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground/90">
            سوق غزة
          </span>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            من أهل غزة، لأهل غزة
          </h1>
          <p className="text-sm text-primary-foreground/85">
            سيارات، عقارات، إلكترونيات وأكثر — بيع واشترِ من جيرانك، بثقة.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="default"
              variant="secondary"
              className="gap-1.5 font-semibold"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              أضف
            </Button>
            <Button
              type="button"
              size="default"
              variant="ghost"
              className="font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={() => setExploreOpen(true)}
            >
              تصفّح
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="relative mx-auto hidden max-w-2xl space-y-6 text-center sm:block lg:max-w-4xl">
        <WovenTexture opacity={0.07} />
        <span className="inline-block rounded-full border border-primary-foreground/30 px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground/90">
          سوق غزة
        </span>

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          من أهل غزة، لأهل غزة
        </h1>
        <p className="text-base text-primary-foreground/85 sm:text-lg">
          سيارات، عقارات، إلكترونيات وأكثر — بيع واشترِ من جيرانك، بثقة.
        </p>

        <SearchBar className="mx-auto max-w-xl lg:max-w-2xl [&_input]:bg-primary-foreground [&_input]:text-foreground" />

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="gap-2 font-semibold shadow-md transition-transform hover:scale-[1.03]"
            onClick={() => setCreateOpen(true)}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            أضف
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => setExploreOpen(true)}
          >
            تصفّح
          </Button>
        </div>
      </div>

      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
      <ExploreSheet open={exploreOpen} onOpenChange={setExploreOpen} />
    </section>
  );
}
