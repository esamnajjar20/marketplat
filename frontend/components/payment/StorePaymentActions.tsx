'use client';

import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';

/** توافق قديم — زر دفع واحد يفتح كل الطرق */
export function StorePaymentActions({
  storeName,
  storePhone,
  paymentMethods,
  className,
}: {
  storeName: string;
  storePhone: string;
  paymentMethods?: unknown;
  className?: string;
}) {
  return (
    <StorePaymentMethods
      paymentMethods={paymentMethods}
      entityName={storeName}
      storeName={storeName}
      fallbackName={storeName}
      fallbackPhone={storePhone}
      className={className}
    />
  );
}
