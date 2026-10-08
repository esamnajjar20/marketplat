/**
 * W5 — build-time warming manifest.
 *
 * Produces public/warming-manifest.json from the routes explicitly approved
 * by offlineRouteShells.ts plus Next's generated app build manifest. The
 * manifest is advisory: runtime warming still verifies every asset before
 * promoting a route, so a missing/changed Next manifest can never make an
 * offline route partially committed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'lib/offlineRouteShells.ts'), 'utf8');
const outputPath = path.join(root, 'public/warming-manifest.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

function extractArray(name) {
  const match = source.match(new RegExp(`export const ${name}(?:\\s*:[^=;]+)?\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`));
  if (!match) return [];
  return [...match[1].matchAll(/['"](\/[^'"]+)['"]/g)].map((m) => m[1]);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function flattenAssets(value, out = new Set()) {
  if (typeof value === 'string' && (value.startsWith('/_next/') || value.startsWith('_next/'))) {
    out.add(value.startsWith('/') ? value : `/${value}`);
  } else if (Array.isArray(value)) {
    for (const item of value) flattenAssets(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) flattenAssets(item, out);
  }
  return out;
}

function routeAssets(manifests, route) {
  const list = Array.isArray(manifests) ? manifests : [manifests];
  const clean = route.replace(/\/$/, '') || '/';
  const suffix = clean === '/' ? '' : clean;

  // Next 16 App Router manifests use multiple shapes:
  //   app-build-manifest.json  → { pages: { '/products': [...chunks] } }
  //   app-paths-manifest.json  → { '/products/page': './app/(public)/products/page.js' }
  //   build-manifest.json      → { pages: { '/products': [...] } }
  // Try every candidate key, then fall back to suffix scan.
  const candidates = [
    clean,
    clean === '/' ? '/page' : `${clean}/page`,
    `${clean}.js`,
    clean === '/' ? '/page.js' : `${clean}/page.js`,
    `app${suffix}/page`,
    `app${suffix || ''}/page`,
    `app${suffix}/page.js`,
    `app${suffix || ''}/page.js`,
    `app/(public)${suffix}/page`,
    `app/(public)${suffix}/page.js`,
    `app/(protected)${suffix}/page`,
    `app/(protected)${suffix}/page.js`,
  ];

  const out = new Set();
  for (const manifest of list) {
    if (!manifest || typeof manifest !== 'object') continue;
    const pages = manifest.pages ?? manifest.app ?? manifest;
    for (const candidate of candidates) {
      if (pages && Object.prototype.hasOwnProperty.call(pages, candidate)) {
        flattenAssets(pages[candidate], out);
      }
    }
    // Suffix scan (fallback)
    if (pages && typeof pages === 'object') {
      const routeSuffix = clean === '/' ? '/page' : `${clean}/page`;
      for (const [key, value] of Object.entries(pages)) {
        if (key.endsWith(routeSuffix) || key.endsWith(`${routeSuffix}.js`)) {
          flattenAssets(value, out);
        }
      }
    }
  }
  return [...out].sort();
}

const appManifest = readJson(path.join(root, '.next/server/app-build-manifest.json'));
const appPathsManifest = readJson(path.join(root, '.next/server/app-paths-manifest.json'));
const buildManifest = readJson(path.join(root, '.next/build-manifest.json'));
const buildId = (() => {
  try { return fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim() || undefined; } catch { return undefined; }
})();
const publicRoutes = extractArray('CORE_ROUTES');
const personalRoutes = extractArray('PERSONAL_SHELL_ROUTES_ESSENTIAL');
const routes = [...new Set([...publicRoutes, ...personalRoutes])];

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  ...(buildId ? { buildId } : {}),
  source: appManifest ? 'next-app-build-manifest' : appPathsManifest ? 'next-app-paths-manifest' : buildManifest ? 'next-build-manifest' : 'route-source-only',
  routes: Object.fromEntries(routes.map((route) => [route, {
    assets: routeAssets([appManifest, appPathsManifest, buildManifest], route),
    auth: personalRoutes.includes(route),
  }])),
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[warming-manifest] wrote ${routes.length} routes -> ${path.relative(root, outputPath)}`);
