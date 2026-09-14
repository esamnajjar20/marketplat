'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adjustProductStock } from '@/api/products-stock.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';

export function useAdjustProductStock() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stockQuantity }: { id: string; stockQuantity: number | null }) =>
      adjustProductStock(id, stockQuantity),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products.mine() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      toast.success('تم تحديث المخزون');
    },
    onError: toastMutationError,
  });
}
