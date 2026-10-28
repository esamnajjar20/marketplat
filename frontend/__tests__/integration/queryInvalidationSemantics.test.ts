import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateAdBrowseCaches, invalidateAdEntityCaches, invalidateProductBrowseCaches, invalidateServiceListingCaches, invalidateCustomerCaches, invalidateRequestCaches } from '@/lib/queryInvalidation';

const clients: QueryClient[] = [];
function makeClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return client;
}
function seed(client: QueryClient, key: readonly unknown[]) {
  client.setQueryData(key, { seeded: true });
}
function invalidated(client: QueryClient, key: readonly unknown[]) {
  return client.getQueryState(key)?.isInvalidated ?? false;
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('targeted query invalidation semantics', () => {
  it('invalidates ad collections and related rails on create without staling unrelated detail pages', async () => {
    const client = makeClient();
    const list = queryKeys.ads.list({ page: 1 });
    const search = queryKeys.ads.search({ q: 'chair' });
    const infinite = queryKeys.ads.infinite('browse', { pageSize: 20 });
    const mine = queryKeys.ads.mine({ page: 1 });
    const detail = queryKeys.ads.detail('unrelated-ad');
    const related = queryKeys.ads.related('unrelated-ad');
    const stats = queryKeys.ads.myStats();
    [list, search, infinite, mine, detail, related, stats].forEach((key) => seed(client, key));

    await invalidateAdBrowseCaches(client);

    expect(invalidated(client, list)).toBe(true);
    expect(invalidated(client, search)).toBe(true);
    expect(invalidated(client, infinite)).toBe(true);
    expect(invalidated(client, mine)).toBe(true);
    expect(invalidated(client, stats)).toBe(true);
    expect(invalidated(client, detail)).toBe(false);
    expect(invalidated(client, related)).toBe(true);
  });

  it('invalidates an affected ad detail and related rails for an entity write', async () => {
    const client = makeClient();
    const detail = queryKeys.ads.detail('ad-1');
    const otherDetail = queryKeys.ads.detail('ad-2');
    const related = queryKeys.ads.related('ad-2');
    [detail, otherDetail, related].forEach((key) => seed(client, key));

    await invalidateAdEntityCaches(client, 'ad-1');

    expect(invalidated(client, detail)).toBe(true);
    expect(invalidated(client, otherDetail)).toBe(false);
    expect(invalidated(client, related)).toBe(true);
  });

  it('invalidates product collections and a targeted detail without touching other details or stock history unless requested', async () => {
    const client = makeClient();
    const list = queryKeys.products.list({ page: 1 });
    const infinite = queryKeys.products.infinite({ pageSize: 20 });
    const promoted = queryKeys.products.promotedInfinite(20);
    const mine = queryKeys.products.mine({ page: 1 });
    const detail = queryKeys.products.detail('product-1');
    const otherDetail = queryKeys.products.detail('product-2');
    const stockHistory = queryKeys.products.stockHistoryRoot();
    [list, infinite, promoted, mine, detail, otherDetail, stockHistory].forEach((key) => seed(client, key));

    await invalidateProductBrowseCaches(client, { productId: 'product-1' });

    expect(invalidated(client, list)).toBe(true);
    expect(invalidated(client, infinite)).toBe(true);
    expect(invalidated(client, promoted)).toBe(true);
    expect(invalidated(client, mine)).toBe(true);
    expect(invalidated(client, detail)).toBe(true);
    expect(invalidated(client, otherDetail)).toBe(false);
    expect(invalidated(client, stockHistory)).toBe(false);
  });


  it('invalidates customer collections and one known customer detail, not unrelated details', async () => {
    const client = makeClient();
    const list = queryKeys.customers.list({ page: 1 });
    const search = queryKeys.customers.search('ali');
    const summary = queryKeys.customers.summary();
    const detail = queryKeys.customers.detail('customer-1');
    const otherDetail = queryKeys.customers.detail('customer-2');
    [list, search, summary, detail, otherDetail].forEach((key) => seed(client, key));

    await invalidateCustomerCaches(client, 'customer-1');

    expect(invalidated(client, list)).toBe(true);
    expect(invalidated(client, search)).toBe(true);
    expect(invalidated(client, summary)).toBe(true);
    expect(invalidated(client, detail)).toBe(true);
    expect(invalidated(client, otherDetail)).toBe(false);
  });

  it('invalidates request feeds and the affected request only', async () => {
    const client = makeClient();
    const open = queryKeys.requests.open({ page: 1 });
    const mine = queryKeys.requests.mine({ page: 1 });
    const offers = queryKeys.requests.myOffers({ page: 1 });
    const detail = queryKeys.requests.detail('request-1');
    const otherDetail = queryKeys.requests.detail('request-2');
    [open, mine, offers, detail, otherDetail].forEach((key) => seed(client, key));

    await invalidateRequestCaches(client, 'request-1');

    expect(invalidated(client, open)).toBe(true);
    expect(invalidated(client, mine)).toBe(true);
    expect(invalidated(client, offers)).toBe(true);
    expect(invalidated(client, detail)).toBe(true);
    expect(invalidated(client, otherDetail)).toBe(false);
  });

  it('invalidates stock summaries and history only when explicitly requested', async () => {
    const client = makeClient();
    const summary = queryKeys.products.stockSummary();
    const history = queryKeys.products.stockHistory({ page: 1 });
    seed(client, summary);
    seed(client, history);

    await invalidateProductBrowseCaches(client, { includeStock: true, includeStockHistory: true });

    expect(invalidated(client, summary)).toBe(true);
    expect(invalidated(client, history)).toBe(true);
  });

  it('invalidates service-list collections and one known detail without staling unrelated details', async () => {
    const client = makeClient();
    const list = queryKeys.serviceListings.list({ page: 1 });
    const infinite = queryKeys.serviceListings.infinite({ pageSize: 20 });
    const mine = queryKeys.serviceListings.mine({ page: 1 });
    const detail = queryKeys.serviceListings.detail('service-1');
    const otherDetail = queryKeys.serviceListings.detail('service-2');
    [list, infinite, mine, detail, otherDetail].forEach((key) => seed(client, key));

    await invalidateServiceListingCaches(client, 'service-1');

    expect(invalidated(client, list)).toBe(true);
    expect(invalidated(client, infinite)).toBe(true);
    expect(invalidated(client, mine)).toBe(true);
    expect(invalidated(client, detail)).toBe(true);
    expect(invalidated(client, otherDetail)).toBe(false);
  });
});
