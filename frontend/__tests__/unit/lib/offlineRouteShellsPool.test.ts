/**
 * FIX WARM-CHUNK-POOL-01: chunk fetches for a route go through a bounded pool,
 * so their timeouts measure real latency instead of browser-queue dwell time.
 */
import { describe, it, expect } from 'vitest';
import { settlePool } from '@/lib/offlineRouteShells';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('settlePool', () => {
  it('never runs more than `limit` workers at once, and visits every item', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    const results = await settlePool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(5);
      seen.push(n);
      active -= 1;
      return n * 2;
    });
    expect(peak).toBe(4);
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('keeps result order and settles failures instead of throwing (allSettled semantics)', async () => {
    const results = await settlePool(['a', 'b', 'c'], 2, async (x) => {
      if (x === 'b') throw new Error('chunk-503');
      return x;
    });
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    await expect(settlePool([], 4, async () => 1)).resolves.toEqual([]);
    const r = await settlePool([1], 10, async (n) => n);
    expect(r).toEqual([{ status: 'fulfilled', value: 1 }]);
  });
});
