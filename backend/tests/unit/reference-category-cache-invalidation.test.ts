import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('reference category cache dependency invalidation', () => {
  const productCategoriesSource = readFileSync(
    join(__dirname, '../../src/modules/product-categories/product-categories.service.ts'),
    'utf8',
  );
  const categoriesSource = readFileSync(
    join(__dirname, '../../src/modules/categories/categories.service.ts'),
    'utf8',
  );

  it('invalidates product-list and homepage caches when product category labels/tree change', () => {
    expect(productCategoriesSource).toContain("bumpPublicListCache('products')");
    expect(productCategoriesSource).toContain('await invalidateHomeCache()');
    expect(productCategoriesSource).toContain('await invalidateProductCategoriesCache()');
  });

  it('invalidates cached ads and homepage when ad category reference data changes', () => {
    expect(categoriesSource).toContain('bumpAdsCacheVersionAndHome');
    expect(categoriesSource).toContain('await bumpAdsCacheVersionAndHome()');
    expect(categoriesSource).toContain('await invalidateCategoriesCache()');
  });
});
