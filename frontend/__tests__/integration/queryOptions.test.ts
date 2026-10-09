import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';
import { customerListQueryOptions, customerSearchQueryOptions } from '@/hooks/queries/useCustomers';
import { salesListQueryOptions } from '@/hooks/queries/useSales';

describe('typed query options', () => {
  it('uses the same typed sales parameters in its cache key', () => {
    const params = { page: 2, limit: 12, status: 'PAID' as const, storeId: 'store-1' };
    expect(salesListQueryOptions(params).queryKey).toEqual(queryKeys.sales.list(params));
  });

  it('uses the same typed customer parameters in its cache key', () => {
    const params = { page: 3, limit: 20, q: 'shop', dueOnly: true };
    expect(customerListQueryOptions(params).queryKey).toEqual(queryKeys.customers.list(params));
  });

  it('keys customer search by the exact term passed to the request function', () => {
    expect(customerSearchQueryOptions('محمود').queryKey).toEqual(queryKeys.customers.search('محمود'));
  });
});
