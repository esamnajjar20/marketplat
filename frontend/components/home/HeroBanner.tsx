'use client';

/**
 * Hero الرئيسية — تصميم هادئ وواضح:
 * ترحيب محلي، إجراءان فقط (نشر / استكشاف)، بدون ضوضاء بصرية.
 */
import { useEffect, useState } from 'react';
import { Plus, Compass, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/shared/ui/Button';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { ExploreSheet } from '@/components/layout/ExploreSheet';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const ROTATING_CREATE_LABELS = [
  'انشر إعلانًا',
  'أضف منتجًا',
  'أضف خدمة',
  'اطلب خدمة',
] as const;

export function HeroBanner() {
  const [createLabelIndex, setCreateLabelIndex] = useState(0);
  const [labelVisible, setLabelVisible] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const city = useAuthStore((s) => s.user?.city?.trim() || null);
  const name = useAuthStore((s) => s.user?.name?.split(' ')[0] || null);

  useEffect(() => {
    const id = setInterval(() => {
      setLabelVisible(false);
      window.setTimeout(() => {
        setCreateLabelIndex((i) => (i + 1) % ROTATING_CREATE_LABELS.length);
        setLabelVisible(true);
      }, 200);
    }, 3400);
    return () => clearInterval(id);
  }, []);

  const createLabel = ROTATING_CREATE_LABELS[createLabelIndex];
  const greeting = name
    ? `مرحبًا ${name}`
    : city
      ? `سوق ${city}`
      : 'سوق غزة المحلي';

  return (
    <section className="relative overflow-hidden">
      {/* خلفية ناعمة */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-primary/[0.08] via-background to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -start-24 top-0 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-20 top-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-3xl px-4 pb-6 pt-6 sm:pb-10 sm:pt-10">
        <div className="space-y-5 text-center sm:space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            {greeting}
            {city && name ? <span className="text-border">·</span> : null}
            {city && name ? <span>في {city}</span> : null}
          </div>

          <div className="space-y-2.5">
            <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              ابحث، اشترِ، أو اعرض
              <span className="block text-primary">من جيرانك في غزة</span>
            </h1>
            <p className="mx-auto max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              إعلانات ومنتجات وخدمات محلية — بسيطة، قريبة، وموثوقة.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:justify-center sm:gap-3">
            <Button
              type="button"
              size="lg"
              className="h-12 gap-2 rounded-2xl px-5 text-base font-semibold shadow-sm"
              onClick={() => setCreateOpen(true)}
              aria-label={createLabel}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-foreground/20">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <span
                className={cn(
                  'inline-block min-w-[7.5rem] transition-all duration-200',
                  labelVisible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
                )}
              >
                {createLabel}
              </span>
            </Button>

            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-12 gap-2 rounded-2xl border-border/80 bg-card/60 px-5 text-base font-semibold backdrop-blur"
              onClick={() => setExploreOpen(true)}
            >
              <Compass className="h-5 w-5 text-primary" aria-hidden />
              تصفح التصنيفات
            </Button>
          </div>

          <Link
            href={ROUTES.search}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            أو ابحث عن شيء محدد
          </Link>
        </div>
      </div>

      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
      <ExploreSheet open={exploreOpen} onOpenChange={setExploreOpen} />
    </section>
  );
}
