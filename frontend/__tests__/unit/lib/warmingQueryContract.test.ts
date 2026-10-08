import { describe, expect, it } from 'vitest';
import { getWarmingQueryByPath, PUBLIC_WARMING_QUERIES, USER_WARMING_QUERIES } from '../../../lib/warmingQueryContract';

function key(value: readonly unknown[]) {
  return JSON.stringify(value);
}

describe('warming query contract', () => {
  it('keeps public warm URLs unique and query-keyed', () => {
    const paths = PUBLIC_WARMING_QUERIES.map((x) => x.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const entry of PUBLIC_WARMING_QUERIES) {
      if (entry.consumer === 'react-query') expect(key(entry.queryKey ?? [])).not.toBe('[]');
      else expect(entry.queryKey).toBeUndefined();
    }
  });

  it('resolves known user endpoints to the same canonical key factory', () => {
    const conversations = getWarmingQueryByPath('/conversations?limit=20');
    expect(conversations?.scope).toBe('user');
    expect(conversations?.consumer).toBe('react-query');
    expect(USER_WARMING_QUERIES.some((x) => x.id === 'product-categories')).toBe(false);
    expect(USER_WARMING_QUERIES.some((x) => x.id === 'my-store')).toBe(false);
  });
});
