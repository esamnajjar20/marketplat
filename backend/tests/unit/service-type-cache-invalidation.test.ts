import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('service-type dependent cache invalidation', () => {
  const serviceTypesSource = readFileSync(
    join(__dirname, '../../src/modules/service-types/service-types.service.ts'),
    'utf8',
  );
  const serviceCategoriesSource = readFileSync(
    join(__dirname, '../../src/modules/service-categories/service-categories.service.ts'),
    'utf8',
  );

  it('invalidates the service-category tree when service types or fields change', () => {
    expect(serviceTypesSource).toContain('invalidateServiceCategoriesCache()');
    expect(serviceCategoriesSource).toContain('export const invalidateServiceCategoriesCache');
  });

  it('hard-invalidates cached service listings and the homepage after service-type mutations', () => {
    expect(serviceTypesSource).toContain("hidePublicEntities('service-listings')");
    expect(serviceTypesSource).toContain('whose service rail is assembled from the cached service-list endpoint');
  });
});
