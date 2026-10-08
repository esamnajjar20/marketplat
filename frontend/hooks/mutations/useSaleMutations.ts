'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { salesApi } from '@/api/sales.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';
import type { CreateSalePayload } from '@/types/sale.types';
import { createSaleWithOfflineSupport } from '@/lib/sales-offline/salesSync';
import { useAuthStore, selectUser } from '@/store/auth.store';

export function useCreateSale() {
  const userId = useAuthStore(selectUser)?.id ?? null;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSalePayload) => {
      if (!userId) throw new Error('يجب تسجيل الدخول لتسجيل البيع');
      const outcome = await createSaleWithOfflineSupport(userId, payload);
      if (outcome.queued) throw { code: 'OFFLINE_SALE_QUEUED', message: 'تم حفظ البيع محليًا وسيُرسل عند عودة الاتصال.', queued: true };
      return outcome.result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.stockSummary() });
      toast.success('تم تسجيل البيع بنجاح');
    },
    onError: (error: unknown) => {
      if ((error as { code?: string })?.code === 'OFFLINE_SALE_QUEUED') {
        toast.message('تم حفظ البيع محليًا', { description: 'سيُرسل تلقائيًا عند عودة الاتصال.' });
      }
    },
  });
}


export function useAddSalePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount: number; method: import('@/types/sale.types').SaleTransferMethod; transferRef?: string; note?: string } }) => salesApi.addPayment(id, payload).then(r => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.debts() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
      toast.success('تم تسجيل الدفعة');
    },
  });
}

export function useReturnSale() { const qc=useQueryClient(); return useMutation({ mutationFn: ({id,payload}:{id:string;payload:Parameters<typeof salesApi.addReturn>[1]})=>salesApi.addReturn(id,payload).then(r=>r.data.data), onSuccess:()=>{ void qc.invalidateQueries({queryKey:queryKeys.sales.all()}); void qc.invalidateQueries({queryKey:queryKeys.products.all()}); void qc.invalidateQueries({queryKey:queryKeys.products.stockSummary()}); void qc.invalidateQueries({queryKey:queryKeys.customers.all()}); toast.success('تم تسجيل المرتجع'); }}); }


export function useUpdateSalesCostSettings() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (enabled:boolean) => salesApi.updateCostSettings(enabled).then(r => r.data.data), onSuccess: () => { void qc.invalidateQueries({ queryKey: [...queryKeys.sales.all(), 'cost-settings'] }); void qc.invalidateQueries({ queryKey: queryKeys.sales.all() }); toast.success('تم تحديث إعداد التكلفة الحقيقية'); } });
}

export function useUpdateProductCost() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({productId,costPrice}:{productId:string;costPrice:number|null}) => salesApi.updateProductCost(productId,costPrice).then(r => r.data.data), onSuccess: () => { void qc.invalidateQueries({ queryKey: [...queryKeys.sales.all(), 'cost-products'] }); void qc.invalidateQueries({ queryKey: queryKeys.products.all() }); toast.success('تم حفظ تكلفة المنتج'); } });
}
