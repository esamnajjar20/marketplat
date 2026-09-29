import { warmPublicCaches, WARMUP_TASKS } from '../../src/shared/utils/cacheWarmup';

jest.mock('../../src/modules/home/home.cache', () => ({ getCachedHomepage: jest.fn() }));
jest.mock('../../src/modules/categories/categories.service', () => ({
  categoriesService: { getCategories: jest.fn() },
}));
jest.mock('../../src/modules/product-categories/product-categories.service', () => ({
  productCategoriesService: { getProductCategories: jest.fn() },
}));
jest.mock('../../src/modules/service-categories/service-categories.service', () => ({
  serviceCategoriesService: { getServiceCategories: jest.fn() },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('warmPublicCaches (FIX CACHE-WARMUP-01)', () => {
  it('warms only viewer-independent keys: general home + the three category trees', () => {
    expect(WARMUP_TASKS.map((t) => t.name)).toEqual([
      'home:general',
      'categories',
      'product-categories',
      'service-categories',
    ]);
  });

  it('runs every task, sequentially, and reports counts', async () => {
    const order: string[] = [];
    const tasks = ['a', 'b', 'c'].map((name) => ({
      name,
      run: async () => {
        order.push(`${name}:start`);
        await Promise.resolve();
        order.push(`${name}:end`);
      },
    }));
    const result = await warmPublicCaches(tasks);
    expect(result).toEqual({ ok: 3, failed: 0 });
    // sequential: a fully finishes before b starts
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('a failing task never throws and never stops the remaining tasks', async () => {
    const ran: string[] = [];
    const result = await warmPublicCaches([
      { name: 'boom', run: async () => { throw new Error('redis down'); } },
      { name: 'after', run: async () => { ran.push('after'); } },
    ]);
    expect(result).toEqual({ ok: 1, failed: 1 });
    expect(ran).toEqual(['after']);
  });
});
