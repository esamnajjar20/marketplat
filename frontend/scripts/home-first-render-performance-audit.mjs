import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefetch = fs.readFileSync(path.join(root, 'lib/prefetch.ts'), 'utf8');
const feedApi = fs.readFileSync(path.join(root, 'api/home-feed.api.ts'), 'utf8');
const feedHook = fs.readFileSync(path.join(root, 'hooks/queries/useHomeFeed.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/(public)/page.tsx'), 'utf8');

const checks = [
  ['SSR prefetch wait is bounded to 1.2 seconds', /HOME_PREFETCH_TIMEOUT_MS\s*=\s*1200/.test(prefetch)],
  ['SSR races the prefetch against its timeout', /Promise\.race\(\[\s*qc\.prefetchQuery[\s\S]*?timeout\s*,?\s*\]\)/.test(prefetch)],
  ['Guest SSR uses the public static feed', /fetchServerApi<HomeFeedPayload>\(\s*'\/home\/static'/.test(prefetch)],
  ['Client guest query uses the same static feed', /homeFeedApi\.getStatic/.test(feedHook)],
  ['Client query uses the same home feed key factory', /queryKeys\.home\.feed/.test(feedHook) && /homeFeedQueryKey\(undefined, null, false\)/.test(prefetch)],
  ['Homepage still hydrates the server query cache', /HydrationBoundary state=\{dehydrate\(qc\)\}/.test(page)],
  ['Client fetch is enabled after auth and city are ready', /enabled:\s*isHydrated\s*&&\s*isReady/.test(feedHook)],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exitCode = 1;
