'use client';

import { useState } from 'react';
import { Banknote, Wifi } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';
import { InternetCardsQRDialog } from '@/components/payment/InternetCardsQRDialog';

/**
 * أزرار سريعة في الصفحة الرئيسية: دفع QR + بطاقات نت.
 * لا تعتمد على متجر معيّن — المستخدم يدخل الرقم أو يختار من المحفوظات.
 */
export function HomeQuickActions() {
  const [payOpen, setPayOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);

  return (
    <>
      <section
        className="container mx-auto max-w-2xl px-4 py-3"
        aria-label="إجراءات سريعة"
      >
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
