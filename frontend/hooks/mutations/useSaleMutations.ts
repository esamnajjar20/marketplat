'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi } from '@/api/sales.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';
import type { CreateSalePayload } from '@/types/sale.types';

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSalePayload) => salesApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.stockSummary() });
      toast.success('تم تسجيل البيع بنجاح');
    },
  });
}


export function useAddSalePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount: number; method: import('@/types/sale.types').SaleTransferMethod; transferRef?: string; note?: string } }) => salesApi.addPayment(id, payload).then(r => r.data.data),
    onSuccess: (_sale, vars) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.detail(vars.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.debts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      toast.success('تم تسجيل الدفعة');
    },
  });
}
