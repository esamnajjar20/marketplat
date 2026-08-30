'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Wifi } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';
import { ROUTES } from '@/lib/constants';

/**
 * شريط إجراءات الرئيسية: دفع + بطاقات نت + روابط التنزيلات والمحفوظات.
 */
export function HomeQuickActions() {
  const [payOpen, setPayOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <>
      <section className="container mx-auto max-w-7xl space-y-2 px-4 pt-4 sm:pt-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Button
            type="button"
            variant="default"
            className="h-auto gap-2 rounded-2xl py-3.5 text-sm font-semibold shadow-sm transition-all hover:shadow-md"
            onClick={() => setPayOpen(true)}
          >
            <Banknote className="h-5 w-5" aria-hidden />
            دفع
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto gap-2 rounded-2xl border-2 py-3.5 text-sm font-semibold transition-all hover:shadow-md"
            onClick={() => setCardsOpen(true)}
          >
            <Wifi className="h-5 w-5" aria-hidden />
            بطاقات نت
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link href={ROUTES.savedPayments} className="hover:text-primary hover:underline">
            الأسماء والبطاقات المحفوظة
          </Link>
          <span aria-hidden>·</span>
          <Link href={ROUTES.downloads} className="hover:text-primary hover:underline">
            التنزيلات
          </Link>
        </div>
      </section>

      <PayWithQRDialog open={payOpen} onOpenChange={setPayOpen} />
      <InternetCardsQRDialog open={cardsOpen} onOpenChange={setCardsOpen} />
    </>
  );
}
