import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['ads list forwards query signal', 'hooks/queries/useAds.ts', 'adsApi.getAll(params, { signal })'],
  ['ads search forwards query signal', 'hooks/queries/useAds.ts', 'adsApi.searchAds(params, { signal })'],
  ['ad detail forwards query signal', 'hooks/queries/useAds.ts', 'adsApi.getById(id, { signal })'],
  ['related ads forwards query signal', 'hooks/queries/useAds.ts', 'adsApi.getRelated(id, { signal })'],
  ['my ads forwards query signal', 'hooks/queries/useAds.ts', 'adsApi.getMyAds(params, { signal })'],
  ['ad stats forwards query signal', 'hooks/queries/useAds.ts', 'adsApi.getMyStats({ signal })'],
  ['public user ads forwards query signal', 'hooks/queries/useAds.ts', 'usersApi.getUserAds(userId, params, { signal })'],
  ['product browse forwards query signal', 'hooks/queries/useProducts.ts', 'productsApi.getAll(params, { signal })'],
  ['product detail forwards query signal', 'hooks/queries/useProducts.ts', 'productsApi.getById(id, { signal })'],
  ['my products forwards query signal', 'hooks/queries/useProducts.ts', 'productsApi.getMine(params, { signal })'],
  ['unified search forwards query signal', 'hooks/queries/useSearch.ts', 'searchApi.search(params, { signal })'],
  ['suggestions forwards query signal', 'hooks/queries/useSearch.ts', 'searchApi.suggest({ q }, { signal })'],
  ['all recommendation types forward query signal', 'hooks/queries/useRecommendations.ts', '({ signal }) => recommendationsApi.get'],
  ['ads offline fallback preserves cancellation', 'hooks/queries/useAds.ts', 'if (signal.aborted ||'],
  ['products offline fallback preserves cancellation', 'hooks/queries/useProducts.ts', 'if (signal.aborted ||'],
  ['search offline fallback preserves cancellation', 'hooks/queries/useSearch.ts', 'if (signal.aborted ||'],
  ['ads API accepts Axios request config', 'api/ads.api.ts', 'config?: AxiosRequestConfig'],
  ['products API accepts Axios request config', 'api/products.api.ts', 'config?: AxiosRequestConfig'],
  ['search API accepts Axios request config', 'api/search.api.ts', 'config?: AxiosRequestConfig'],
  ['recommendations API accepts Axios request config', 'api/recommendations.api.ts', 'config?: AxiosRequestConfig'],
  ['users ads API accepts Axios request config', 'api/users.api.ts', 'config?: AxiosRequestConfig'],
];
let failures = 0;
for (const [label, rel, needle] of checks) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  const ok = source.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
const recs = fs.readFileSync(path.join(root, 'hooks/queries/useRecommendations.ts'), 'utf8');
const signalFactories = (recs.match(/queryFn: \(\{ signal \}\) => recommendationsApi\./g) ?? []).length;
const recsOk = signalFactories === 6;
console.log(`${recsOk ? 'PASS' : 'FAIL'} all six recommendation factories forward signal (${signalFactories}/6)`);
if (!recsOk) failures++;
console.log(`\n${checks.length + 1 - failures}/${checks.length + 1} checks passed`);
process.exitCode = failures ? 1 : 0;
