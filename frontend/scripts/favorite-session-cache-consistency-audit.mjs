import fs from 'node:fs';

const checks = [];
function check(name, condition) {
  checks.push({ name, passed: Boolean(condition) });
}

const queries = fs.readFileSync('hooks/queries/useFavorites.ts', 'utf8');
const mutations = fs.readFileSync('hooks/mutations/useFavoriteMutations.ts', 'utf8');

check('ad favorite check reconciles both positive and negative server states',
  /if \(query\.data\) next\.add\(adId\);\s*else next\.delete\(adId\);/.test(queries));
check('ad negative reconciliation skips while the matching ad toggle is pending',
  /mutation\.options\.mutationKey\?\.\[0\] === 'favorite-toggle'[\s\S]*?mutation\.options\.mutationKey\?\.\[1\] === 'ad'[\s\S]*?mutation\.state\.variables === adId/.test(queries));
check('entity favorite check reconciles both positive and negative server states',
  /if \(query\.data\) next\.add\(entityId\);\s*else next\.delete\(entityId\);/.test(queries));
check('entity negative reconciliation is guarded by matching type and entity ID',
  /mutation\.options\.mutationKey\?\.\[1\] === type[\s\S]*?mutation\.state\.variables === entityId/.test(queries));
check('ad toggle cancels the per-ad check request before optimistic update',
  /cancelQueries\(\{ queryKey: queryKeys\.favorites\.check\(adId\) \}\)/.test(mutations));
check('entity toggle cancels the per-entity check request before optimistic update',
  /cancelQueries\(\{ queryKey: queryKeys\.favorites\.entityCheck\(type, entityId\) \}\)/.test(mutations));
check('Set updater preserves reference when membership is unchanged',
  /prev && prev\.size === next\.size && \[\.\.\.prev\]\.every\(\(id\) => next\.has\(id\)\)/.test(queries));

for (const result of checks) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
}
console.log(`\n${checks.filter((x) => x.passed).length}/${checks.length} checks passed`);
if (checks.some((x) => !x.passed)) process.exitCode = 1;
