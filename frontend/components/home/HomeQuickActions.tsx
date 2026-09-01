'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Wifi, ChevronLeft, Heart, Download, Bookmark } from 'lucide-react';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * أدوات سريعة أعلى الرئيسية — محفوظات وتنزيلات أولاً ثم الدفع.
 */
export function HomeQuickActions({ className }: { className?: string }) {
  const [payOpen, setPayOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <>
      <section className={cn('container mx-auto max-w-7xl px-4', className)}>
        {/* صف أول: وصول سريع للمحفوظات والتنزيلات */}
        <div className="mb-2 grid grid-cols-3 gap-2">
          <Link
            href={ROUTES.favorites}
            className="flex flex-col items-center gap-1 rounded-xl border border-border/80 bg-card px-2 py-2.5 text-center shadow-xs transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
          >
            <Heart className="h-4 w-4 text-destructive" aria-hidden />
            <span className="text-[11px] font-semibold">المفضلة</span>
          </Link>
          <Link
            href={ROUTES.downloads}
            className="flex flex-col items-center gap-1 rounded-xl border border-border/80 bg-card px-2 py-2.5 text-center shadow-xs transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
          >
            <Download className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-[11px] font-semibold">التنزيلات</span>
          </Link>
          <Link
            href={ROUTES.savedPayments}
            className="flex flex-col items-center gap-1 rounded-xl border border-border/80 bg-card px-2 py-2.5 text-center shadow-xs transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98]"
          >
            <Bookmark className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-[11px] font-semibold">محفوظات الدفع</span>
          </Link>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-card/80 p-2 shadow-xs sm:flex-row sm:items-center sm:gap-3 sm:p-2.5">
          <p className="hidden shrink-0 px-2 text-xs font-medium text-muted-foreground sm:block">
            أدوات سريعة
          </p>
          <div className="grid flex-1 grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98] sm:py-2"
            >
              <Banknote className="h-4 w-4 shrink-0" aria-hidden />
              دفع سريع
            </button>
            <button
              type="button"
              onClick={() => setCardsOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary-soft active:scale-[0.98] sm:py-2"
            >
              <Wifi className="h-4 w-4 shrink-0" aria-hidden />
              بطاقات نت
            </button>
          </div>
          <div className="flex items-center justify-center gap-3 px-1 pb-0.5 text-[11px] text-muted-foreground sm:justify-end sm:pb-0 sm:pe-1">
            <Link href={ROUTES.savedPayments} className="inline-flex items-center gap-0.5 hover:text-foreground">
              المحفوظات
              <ChevronLeft className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <PayWithQRDialog open={payOpen} onOpenChange={setPayOpen} />
      <InternetCardsQRDialog open={cardsOpen} onOpenChange={setCardsOpen} />
    </>
  );
}
