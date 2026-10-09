'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adjustProductStock } from '@/api/products-stock.api';
import { invalidateProductBrowseCaches } from '@/lib/queryInvalidation';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';

export function useAdjustProductStock() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      stockQuantity,
      reason,
    }: {
      id: string;
      stockQuantity: number | null;
      reason?: string;
    }) => adjustProductStock(id, stockQuantity, reason),
    onSuccess: (_data, variables) => {
      void invalidateProductBrowseCaches(qc, { productId: variables.id, includeStock: true, includeStockHistory: true });
      toast.success('تم تحديث المخزون');
    },
    onError: toastMutationError,
  });
}
