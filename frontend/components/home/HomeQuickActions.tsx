'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, Wifi, Search } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';
import { ROUTES } from '@/lib/constants';

/**
 * شريط إجراءات الرئيسية: بحث + دفع + بطاقات نت.
 */
export function HomeQuickActions() {
  const [payOpen, setPayOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <>
      <section className="container mx-auto px-4 pt-4 sm:pt-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-auto gap-2 rounded-2xl border-2 py-3.5 text-sm font-semibold"
            asChild
          >
            <Link href={ROUTES.search}>
              <Search className="h-5 w-5" aria-hidden />
              بحث
            </Link>
          </Button>
          <Button
            type="button"
            variant="default"
            className="h-auto gap-2 rounded-2xl py-3.5 text-sm font-semibold shadow-sm"
            onClick={() => setPayOpen(true)}
          >
            <Banknote className="h-5 w-5" aria-hidden />
            دفع
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto gap-2 rounded-2xl border-2 py-3.5 text-sm font-semibold"
            onClick={() => setCardsOpen(true)}
          >
            <Wifi className="h-5 w-5" aria-hidden />
            بطاقات نت
          </Button>
        </div>
      </section>

      <PayWithQRDialog open={payOpen} onOpenChange={setPayOpen} />
      <InternetCardsQRDialog open={cardsOpen} onOpenChange={setCardsOpen} />
    </>
  );
}
