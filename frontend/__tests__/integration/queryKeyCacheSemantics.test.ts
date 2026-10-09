import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

const clients: QueryClient[] = [];

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe('query key cache contracts', () => {
  it('keeps query params in cache identity while normalizing omitted params', () => {
    const client = createQueryClient();
    const pageOne = queryKeys.products.list({ page: 1, limit: 10 });
    const pageTwo = queryKeys.products.list({ page: 2, limit: 10 });

    expect(queryKeys.products.list()).toEqual(queryKeys.products.list({}));
    expect(pageOne).not.toEqual(pageTwo);

    client.setQueryData(pageOne, ['page-one']);
    client.setQueryData(pageTwo, ['page-two']);
    expect(client.getQueryData(pageOne)).toEqual(['page-one']);
    expect(client.getQueryData(pageTwo)).toEqual(['page-two']);
  });

  it('invalidates product list, infinite, and detail entries under the product root only', async () => {
    const client = createQueryClient();
    const keys = [
      queryKeys.products.list({ page: 1 }),
      queryKeys.products.infinite({ categoryId: 'cat-1' }),
      queryKeys.products.detail('product-1'),
    ] as const;
    const unrelatedKey = queryKeys.serviceListings.list({ page: 1 });

    for (const key of keys) client.setQueryData(key, { ok: true });
    client.setQueryData(unrelatedKey, { ok: true });

    await client.invalidateQueries({ queryKey: queryKeys.products.all(), refetchType: 'none' });

    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });

  it('keeps conversation message pages separate and invalidates all pages for one conversation', async () => {
    const client = createQueryClient();
    const firstPage = queryKeys.conversations.messages('conversation-1', { limit: 20 });
    const secondPage = queryKeys.conversations.messages('conversation-1', { limit: 50 });
    const otherConversation = queryKeys.conversations.messages('conversation-2', { limit: 20 });

    client.setQueryData(firstPage, ['first']);
    client.setQueryData(secondPage, ['second']);
    client.setQueryData(otherConversation, ['other']);

    await client.invalidateQueries({
      queryKey: queryKeys.conversations.messagesRoot('conversation-1'),
      refetchType: 'none',
    });

    expect(client.getQueryState(firstPage)?.isInvalidated).toBe(true);
    expect(client.getQueryState(secondPage)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherConversation)?.isInvalidated).toBe(false);
  });

  it('isolates recommendation cache entries by caller scope and service type', () => {
    const guest = queryKeys.recommendations.services({ serviceTypeId: 'repairs' }, 'guest');
    const user = queryKeys.recommendations.services({ serviceTypeId: 'repairs' }, 'user');
    const anotherType = queryKeys.recommendations.services({ serviceTypeId: 'cleaning' }, 'user');

    expect(guest).not.toEqual(user);
    expect(user).not.toEqual(anotherType);
  });

  it('normalizes provider defaults and separates recommendation caller scopes', () => {
    expect(queryKeys.recommendations.providers()).toEqual(['recommendations', 'providers', {}]);
    expect(queryKeys.recommendations.providers({}, 'guest')).not.toEqual(
      queryKeys.recommendations.providers({}, 'user'),
    );
    expect(queryKeys.recommendations.stores({ limit: 4 }, 'guest')).not.toEqual(
      queryKeys.recommendations.stores({ limit: 4 }, 'user'),
    );
  });

  it('normalizes optional admin dispute params', () => {
    expect(queryKeys.admin.serviceRequestDisputes()).toEqual(
      queryKeys.admin.serviceRequestDisputes({}),
    );
  });

  it('uses the same key shape for infinite feeds and their normalized defaults', () => {
    expect(queryKeys.ads.infinite('browse')).toEqual(queryKeys.ads.infinite('browse', {}));
    expect(queryKeys.search.infinite()).toEqual(queryKeys.search.infinite({}));
    expect(queryKeys.stores.infinite()).toEqual(queryKeys.stores.infinite({}));
  });
});
