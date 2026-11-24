'use client';

import { useQuery } from '@tanstack/react-query';
import { marketplaceOrdersApi } from '@/api/marketplaceOrders.api';

export function useMarketplaceOrders(kind: 'buyer' | 'seller', page = 1) {
  return useQuery({
    queryKey: ['marketplace-orders', kind, page],
    queryFn: async ({ signal }) => {
      const response = kind === 'seller'
        ? await marketplaceOrdersApi.listForStore({ page, limit: 20 }, { signal })
        : await marketplaceOrdersApi.listMine({ page, limit: 20 }, { signal });
      const items = response.data.data;
      const meta = response.data.meta?.pagination as Record<string, unknown> | undefined;
      if (!response.data.success || !Array.isArray(items)) throw new Error(response.data.message || 'تعذر تحميل الطلبات.');
      return {
        items,
        meta: {
          page: Number(meta?.page ?? page),
          limit: Number(meta?.limit ?? 20),
          total: Number(meta?.total ?? items.length),
          totalPages: Number(meta?.totalPages ?? 1),
          hasNextPage: Number(meta?.page ?? page) < Number(meta?.totalPages ?? 1),
          hasPrevPage: Number(meta?.page ?? page) > 1,
        },
      };
    },
    staleTime: 30_000,
  });
}

export function useMarketplaceOrder(id: string) {
  return useQuery({
    queryKey: ['marketplace-order', id],
    queryFn: async ({ signal }) => {
      const response = await marketplaceOrdersApi.getById(id, { signal });
      if (!response.data.success || !response.data.data) throw new Error(response.data.message || 'تعذر تحميل تفاصيل الطلب.');
      return response.data.data;
    },
    enabled: Boolean(id),
    staleTime: 20_000,
  });
}
