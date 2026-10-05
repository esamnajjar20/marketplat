'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adjustProductStock } from '@/api/products-stock.api';
import { queryKeys } from '@/lib/queryKeys';
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products.mine() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      qc.invalidateQueries({ queryKey: queryKeys.products.stockSummary() });
      qc.invalidateQueries({ queryKey: ['products', 'stock', 'history'] });
      toast.success('تم تحديث المخزون');
    },
    onError: toastMutationError,
  });
}
