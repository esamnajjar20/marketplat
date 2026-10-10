import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, condition) => {
  checks.push({ name, passed: Boolean(condition) });
};

const categories = read('hooks/mutations/useProductCategoryMutations.ts');
const listings = read('hooks/mutations/useServiceListingMutations.ts');

check('product-category mutation captures prior value for the target category',
  categories.includes('previousActive: findPreviousActive(snapshot)'));
check('product-category rollback recursively targets only the failed category',
  categories.includes('category.id === _vars.id ? { isActive: context.previousActive } : {}') &&
  categories.includes('children: category.children?.map(restoreOne)'));
check('same-category concurrent mutations suppress stale rollback',
  categories.includes("mutationKey: ['product-category-active']") &&
  categories.includes('anotherToggleForSameCategoryIsPending') &&
  categories.includes('queryClient.isMutating({'));
check('product-category rollback does not restore the whole stale tree snapshot',
  !/onError:[\s\S]{0,1200}setQueryData\(queryKeys\.productCategories\.adminAll\(\),\s*context\.snapshot\)/.test(categories));
check('service-listing mutation captures prior status of the target listing',
  listings.includes('findServiceListingStatusInCache(data, id)') && listings.includes('const previousStatus = snapshots'));
check('service-listing rollback targets only the failed listing in cached pages',
  listings.includes('updateServiceListingStatusInCache(data, variables.id, context.previousStatus)') && listings.includes('isServiceListingBrowseCacheKey(key)'));
check('same-listing concurrent mutations suppress stale rollback',
  listings.includes("mutationKey: ['service-listing-status']") &&
  listings.includes('anotherToggleForSameListingIsPending') &&
  listings.includes('queryClient.isMutating({'));
check('service-listing rollback no longer replaces entire page snapshots',
  !/onError:[\s\S]{0,800}context\?\.snapshots\.forEach\(\(\[key, data\]\) => queryClient\.setQueryData\(key, data\)\)/.test(listings));
check('both mutations still invalidate after settlement',
  categories.includes('onSettled: () => invalidateProductCategoryQueries(queryClient)') &&
  listings.includes('onSettled: (_data, _error, variables) => invalidateServiceListingCaches(queryClient, variables?.id)'));

for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`\n${checks.filter((item) => item.passed).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.passed)) process.exitCode = 1;
