'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Wifi, ChevronLeft } from 'lucide-react';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * شريط أدوات ثانوي — مضغوط حتى لا ينافس اكتشاف الإعلانات فوق الطية.
 */
export function HomeQuickActions({ className }: { className?: string }) {
  const [payOpen, setPayOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <>
      <section className={cn('container mx-auto max-w-7xl px-4', className)}>
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
          <div className="flex items-center justify-center gap-3 px-1 pb-0.5 text-[11px] text-muted-foreground sm:justify-end sm:pb-0 sm:ps-1">
            <Link
              href={ROUTES.savedPayments}
              className="inline-flex items-center gap-0.5 hover:text-primary"
            >
              المحفوظات
              <ChevronLeft className="h-3 w-3 opacity-60" aria-hidden />
            </Link>
            <span aria-hidden className="text-border">
              |
            </span>
            <Link href={ROUTES.downloads} className="hover:text-primary">
              التنزيلات
            </Link>
          </div>
        </div>
      </section>

      <PayWithQRDialog open={payOpen} onOpenChange={setPayOpen} />
      <InternetCardsQRDialog open={cardsOpen} onOpenChange={setCardsOpen} />
    </>
  );
}
