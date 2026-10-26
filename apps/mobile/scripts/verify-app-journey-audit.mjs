import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const appRoot = path.resolve('app');
const read = (file) => fs.readFileSync(file, 'utf8');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.startsWith('_')) files.push(full);
  }
}
walk(appRoot);
const routeKeys = new Set(files.map((file) => {
  let route = path.relative(appRoot, file).replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '');
  if (route === 'index') return '/';
  return `/${route}`;
}).map((route) => route.replace(/\[[^/]+\]/g, ':param')));
let staticRouteReferences = 0;
for (const file of files) {
  const source = read(file);
  const patterns = [/(?:router\.(?:push|replace|navigate|dismissTo)|href\s*=)\s*\(\s*['"](\/[^'"]+)['"]/g,
    /(?:router\.(?:push|replace|navigate|dismissTo)|href\s*=)\s*['"](\/[^'"]+)['"]/g,
    /pathname:\s*['"](\/[^'"]+)['"]/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = match[1].split(/[?#]/)[0];
      const key = target.replace(/\[[^/]+\]/g, ':param');
      assert.ok(routeKeys.has(key), `Missing route ${target} referenced by ${path.relative(process.cwd(), file)}`);
      staticRouteReferences++;
    }
  }
}
assert.ok(staticRouteReferences >= 20, `Expected substantial navigation coverage, found ${staticRouteReferences}`);

const deepLinks = read('src/features/sharing/deep-links.ts');
for (const route of ['stories', 'ads', 'products', 'stores', 'services', 'profile']) {
  assert.ok(routeKeys.has(`/${route}/:param`), `Missing route required by deep links: /${route}/[id]`);
  assert.ok(deepLinks.includes(`'${route}'`), `Deep-link allowlist missing ${route}`);
}
const viewer = read('app/stories/[id].tsx');
assert.match(viewer, /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(story\?\.id\s*&&\s*accessToken\)\s*void\s*markStoryViewed\(story\.id,\s*accessToken,\s*csrfToken\)/s,
  'Story view should be recorded whenever the active story changes');
assert.ok(fs.existsSync('app.json'), 'Expo app config missing');
assert.match(read('app.json'), /"scheme"\s*:\s*"marketplat"/, 'Expo deep-link scheme missing');
const tsconfig = JSON.parse(read('tsconfig.json'));
assert.ok(!('ignoreDeprecations' in tsconfig.compilerOptions), 'Invalid ignoreDeprecations override should not be present');
assert.ok(fs.existsSync('.env.example'), 'Mobile API URL example is missing');
console.log(`App journey audit passed (${staticRouteReferences} navigation references, 6 deep-link resources, story view tracking and configuration).`);
