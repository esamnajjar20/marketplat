'use client';

/**
 * @deprecated استخدم StorePaymentMethods — الإبقاء للتوافق مع الاستيرادات القديمة.
 */
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';

interface Props {
  storeName: string;
  storePhone: string;
  paymentMethods?: unknown;
  className?: string;
}

export function StorePaymentActions({ storeName, storePhone, paymentMethods, className }: Props) {
  return (
    <StorePaymentMethods
      paymentMethods={paymentMethods}
      fallbackName={storeName}
      fallbackPhone={storePhone}
      className={className}
    />
  );
}
