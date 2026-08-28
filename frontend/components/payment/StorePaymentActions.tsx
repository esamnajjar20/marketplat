'use client';

import { useState } from 'react';
import { Banknote } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { PayWithQRDialog } from '@/components/payment/PayWithQRDialog';

interface Props {
  storeName: string;
  storePhone: string;
  className?: string;
}

/**
 * زر الدفع فقط في صفحة المتجر (بطاقات النت محصورة بالرئيسية).
 */
export function StorePaymentActions({ storeName, storePhone, className }: Props) {
  const [payOpen, setPayOpen] = useState(false);

  return (
    <>
      <div className={className ?? 'mt-3 w-full max-w-sm'}>
        <Button
          type="button"
          variant="default"
          className="h-auto w-full gap-1.5 rounded-full py-2.5 text-sm font-medium"
          onClick={() => setPayOpen(true)}
        >
          <Banknote className="h-4 w-4" aria-hidden />
          دفع
        </Button>
      </div>

      <PayWithQRDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        defaultName={storeName}
        defaultNumber={storePhone}
      />
    </>
  );
}
