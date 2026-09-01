'use client';

import { useEffect, useState } from 'react';
import { Plus, Compass } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { ExploreSheet } from '@/components/layout/ExploreSheet';

/**
 * Hero الرئيسية — بدون خانة بحث (البحث يبقى في الهيدر فقط لتفادي التكرار).
 */
const ROTATING_CREATE_LABELS = [
  'انشر إعلانًا',
  'أضف منتجًا',
  'أضف خدمة جديدة',
] as const;

export function HeroBanner() {
  const [createLabelIndex, setCreateLabelIndex] = useState(0);
  const [labelVisible, setLabelVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setLabelVisible(false);
      window.setTimeout(() => {
        setCreateLabelIndex((i) => (i + 1) % ROTATING_CREATE_LABELS.length);
        setLabelVisible(true);
      }, 220);
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const createLabel = ROTATING_CREATE_LABELS[createLabelIndex];

  const [createOpen, setCreateOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

  return (
    <section className="relative overflow-hidden px-4 pb-2 pt-4 sm:bg-primary sm:px-4 sm:pb-14 sm:pt-16 sm:text-primary-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute -start-20 top-0 hidden h-64 w-64 rounded-full bg-primary-foreground/10 blur-3xl sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 bottom-0 hidden h-48 w-48 rounded-full bg-accent/20 blur-3xl sm:block"
      />

      {/* Mobile */}
      <div className="relative mx-auto max-w-2xl sm:hidden">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/85 p-5 text-primary-foreground shadow-md">
          <WovenTexture opacity={0.07} />
          <div className="relative space-y-3 text-right">
            <span className="inline-block rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1 text-[11px] font-medium tracking-wide text-primary-foreground/95">
              سوق غزة · محلي وموثوق
            </span>
            <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight min-[360px]:text-2xl">
              من أهل غزة، لأهل غزة
            </h1>
            <p className="text-sm leading-relaxed text-primary-foreground/90">
              إعلانات ومتاجر وخدمات — ابحث وانشر وتعامل مع جيرانك بثقة.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="default"
                variant="secondary"
                className="gap-1.5 font-semibold shadow-sm"
                onClick={() => setCreateOpen(true)}
                aria-label={createLabel}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                <span
                  className={`inline-block min-w-[7.5rem] transition-all duration-200 ${
                    labelVisible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
                  }`}
                >
                  {createLabel}
                </span>
              </Button>
              <Button
                type="button"
                size="default"
                variant="ghost"
                className="gap-1.5 font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                onClick={() => setExploreOpen(true)}
              >
                <Compass className="h-4 w-4" aria-hidden />
                استكشف التصنيفات
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="relative mx-auto hidden max-w-2xl space-y-5 text-center sm:block lg:max-w-3xl">
        <WovenTexture opacity={0.07} />
        <span className="inline-block rounded-full border border-primary-foreground/30 bg-primary-foreground/10 px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground/90">
          سوق غزة · محلي وموثوق
        </span>
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
          من أهل غزة، لأهل غزة
        </h1>
        <p className="mx-auto max-w-xl text-base text-primary-foreground/90 sm:text-lg">
          إعلانات، متاجر، ومنتجات وخدمات — بيع واشترِ واطلب خدمة من جيرانك بثقة.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="gap-2 font-semibold shadow-md transition-transform hover:scale-[1.02]"
            onClick={() => setCreateOpen(true)}
                aria-label={createLabel}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            <span
              className={`inline-block min-w-[8.5rem] transition-all duration-200 ${
                labelVisible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
              }`}
            >
              {createLabel}
            </span>
          </Button>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="gap-2 font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            onClick={() => setExploreOpen(true)}
          >
            <Compass className="h-5 w-5" aria-hidden />
            استكشف التصنيفات
          </Button>
        </div>
      </div>

      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
      <ExploreSheet open={exploreOpen} onOpenChange={setExploreOpen} />
    </section>
  );
}
