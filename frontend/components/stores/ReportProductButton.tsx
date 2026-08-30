'use client';

import { ReportButton } from '@/components/shared/ReportButton';
import { useReportProduct } from '@/hooks/mutations/useReportMutations';

export function ReportProductButton({ productId }: { productId: string }) {
  const mutation = useReportProduct(productId);
  return (
    <ReportButton
      triggerLabel="الإبلاغ عن هذا المنتج"
      dialogTitle="الإبلاغ عن المنتج"
      mutation={mutation}
    />
  );
}
