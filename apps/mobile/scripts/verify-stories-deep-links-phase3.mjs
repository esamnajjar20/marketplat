import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [
  ['Story API uses the existing backend feed endpoint', read('src/features/stories/stories.api.ts').includes("'/api/v1/stories/feed'")],
  ['Story API uses the existing per-user endpoint', read('src/features/stories/stories.api.ts').includes('/api/v1/stories/user/')],
  ['Story creation sends multipart image under the backend field name', read('src/features/stories/stories.api.ts').includes("form.append('image'")],
  ['Story creation supports visibility', read('src/features/stories/stories.api.ts').includes("form.append('visibility'")],
  ['Story viewer records authenticated views', read('src/features/stories/stories.api.ts').includes('/view')],
  ['Story viewer can delete own stories', read('src/features/stories/stories.api.ts').includes("method: 'DELETE'")],
  ['Story share URL uses Expo Linking', read('src/features/sharing/deep-links.ts').includes('Linking.createURL')],
  ['Ad details exposes a share action', read('app/ads/[id].tsx').includes("shareMarketPlatResource('ads'")],
  ['Product details exposes a share action', read('app/products/[id].tsx').includes("shareMarketPlatResource('products'")],
  ['Store details exposes a share action', read('app/stores/[id].tsx').includes("shareMarketPlatResource('stores'")],
  ['Deep-link share supports existing resource routes', ['stories','ads','products','stores','services','profile'].every((r) => read('src/features/sharing/deep-links.ts').includes(`'${r}'`))],
  ['Story viewer consumes story and author IDs from deep links', read('app/stories/[id].tsx').includes('userId') && read('app/stories/[id].tsx').includes('useLocalSearchParams')],
  ['Home routes discovery through Explore', read('app/index.tsx').includes("router.push('/explore')")],
  ['Explore screen links to stories', read('app/explore.tsx').includes("path: '/stories'")],
  ['Expo app scheme is configured', read('app.json').includes('"scheme": "marketplat"')],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exitCode = 1;
else console.log(`Verified ${checks.length} stories/deep-link checks.`);
