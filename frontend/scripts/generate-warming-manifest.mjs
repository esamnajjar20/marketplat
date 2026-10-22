/**
 * W5 — build-time warming manifest.
 * FIX WARMING-03: strip route groups (public)/(auth)/...
 * FIX WARMING-04: collect chunks from ALL ancestor dirs
 * FIX WARMING-05: react-loadable keys use prefix match ("src -> mod")
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'lib/offlineRouteShells.ts'), 'utf8');
const outputPath = path.join(root, 'public/warming-manifest.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

// ─── 1) Extract route lists ─────────────────────────────────────
function extractArray(name) {
  const re = new RegExp(
    `export const ${name}(?:\\s*:[^=;]+)?\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`
  );
  const match = source.match(re);
  if (!match) return [];
  return [...match[1].matchAll(/['"](\/[^'"]+)['"]/g)].map((m) => m[1]);
}
const publicRoutes = extractArray('CORE_ROUTES');
const personalRoutes = extractArray('PERSONAL_SHELL_ROUTES_ESSENTIAL');
const routes = [...new Set([...publicRoutes, ...personalRoutes])];

// ─── 2) Read manifests ──────────────────────────────────────────
function readJson(relPath) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8')); }
  catch { return null; }
}

const appBuildCandidates = [
  '.next/server/app-build-manifest.json',
  '.next/app-build-manifest.json',
  '.next/standalone/.next/server/app-build-manifest.json',
  '.next/standalone/.next/app-build-manifest.json',
];
const appBuildManifest = appBuildCandidates
  .map((p) => ({ path: p, data: readJson(p) }))
  .find((x) => x.data) || null;

const appPathsManifest = readJson('.next/server/app-paths-manifest.json');
const reactLoadableManifest = readJson('.next/react-loadable-manifest.json');
const buildManifest = readJson('.next/build-manifest.json');

console.log('[warming-manifest] manifests found:', {
  appBuild: appBuildManifest ? appBuildManifest.path : null,
  appPaths: !!appPathsManifest,
  reactLoadable: !!reactLoadableManifest,
  buildManifest: !!buildManifest,
});

// ─── 3) URL → source map (FIX 03) ───────────────────────────────
function stripRouteGroups(p) { return p.replace(/\/\([^)]+\)/g, ''); }

// Next's app-paths manifest keys normally contain route URLs, while the
// compiled source values can retain route-group folders such as app/(public).
// Resolve both forms so route groups never cause a warming manifest miss.
function routeFromAppSource(sourcePath) {
  const normalized = String(sourcePath).replace(/\\/g, '/');
  const appMarker = normalized.match(/(?:^|\/)app\//);
  if (!appMarker || appMarker.index === undefined) return null;
  let routePath = normalized.slice(appMarker.index + appMarker[0].length).replace(/\.(?:js|jsx|ts|tsx|mjs|cjs)$/, '');
  routePath = stripRouteGroups(routePath);
  routePath = routePath.replace(/\/(?:page|route)$/, '');
  if (!routePath || routePath === 'page' || routePath === 'route') return '/';
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

const urlToSource = new Map();
if (appPathsManifest && typeof appPathsManifest === 'object') {
  for (const [key, value] of Object.entries(appPathsManifest)) {
    if (typeof value !== 'string') continue;
    const normKey = stripRouteGroups(key);
    if (normKey === '/page') urlToSource.set('/', value);
    else if (normKey.endsWith('/page')) urlToSource.set(normKey.slice(0, -5), value);
    const sourceAlias = routeFromAppSource(value);
    if (sourceAlias && !urlToSource.has(sourceAlias)) urlToSource.set(sourceAlias, value);
  }
}
console.log(`[warming-manifest] URL→source entries: ${urlToSource.size}`);

// ─── 4) Chunks from app-build-manifest ──────────────────────────
function chunksFromAppBuild(route) {
  if (!appBuildManifest || !appBuildManifest.data) return [];
  const pages = appBuildManifest.data.pages ?? appBuildManifest.data.app ?? {};
  const clean = route === '/' ? '/' : route.replace(/\/$/, '');
  const candidates = [clean, clean === '/' ? '/page' : `${clean}/page`];
  const out = new Set();
  for (const c of candidates) {
    const entry = pages[c];
    if (Array.isArray(entry)) {
      for (const chunk of entry) {
        if (typeof chunk === 'string' && (chunk.startsWith('/_next/') || chunk.startsWith('_next/'))) {
          out.add(chunk.startsWith('/') ? chunk : `/${chunk}`);
        }
      }
    } else if (entry && typeof entry === 'object') {
      for (const v of Object.values(entry)) {
        if (Array.isArray(v)) {
          for (const chunk of v) {
            if (typeof chunk === 'string') out.add(chunk.startsWith('/') ? chunk : `/${chunk}`);
          }
        }
      }
    }
  }
  return [...out];
}

// ─── 5) Static scan (FIX 04: all ancestors + root) ──────────────
function normalizeChunkRef(ref) {
  if (typeof ref !== 'string') return null;
  if (ref.startsWith('/_next/')) return ref;
  if (ref.startsWith('_next/')) return '/' + ref;
  if (ref.startsWith('static/')) return '/_next/' + ref;
  return null;
}

function collectDirChunks(relDir) {
  const full = path.join('.next/static/chunks', relDir);
  const out = new Set();
  try {
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return out;
    for (const f of fs.readdirSync(full)) {
      if (!/\.(js|css)$/.test(f)) continue;
      if (f.includes('_server') || f.endsWith('.node.js')) continue;
      const rel = path.relative('.next/static/chunks', path.join(full, f));
      out.add('/_next/static/chunks/' + rel.split(path.sep).join('/'));
    }
  } catch { /* ignore */ }
  return out;
}

function chunksFromStaticScan(sourcePath) {
  if (!sourcePath) return [];
  const clean = sourcePath.replace(/^\.\//, '').replace(/\.(js|tsx?|jsx)$/, '');
  const sourceDir = clean.replace(/\/page$/, '');
  const segments = sourceDir.split('/').filter(Boolean);
  if (segments.length === 0) return [];
  const out = new Set();
  for (let i = segments.length; i >= 1; i--) {
    const chunks = collectDirChunks(segments.slice(0, i).join('/'));
    for (const c of chunks) out.add(c);
  }
  // Only include essential framework/main/polyfills from root (not all vendor chunks)
  const rootChunks = collectDirChunks('');
  for (const c of rootChunks) {
    const f = c.split('/').pop() || '';
    if (/^(framework|main|main-app|polyfills|webpack)-/i.test(f) ||
        f.includes('_buildManifest') || f.includes('_ssgManifest')) {
      out.add(c);
    }
  }
  return [...out];
}

// ─── 6) React-loadable (FIX 05: prefix match) ───────────────────
function chunksFromReactLoadable(sourcePath) {
  if (!reactLoadableManifest || !sourcePath) return [];
  const clean = sourcePath.replace(/^\.\//, '');
  const prefixes = [clean, './' + clean];
  const out = new Set();
  for (const [key, value] of Object.entries(reactLoadableManifest)) {
    const matches = prefixes.some((p) => key === p || key.startsWith(p + ' ') || key.startsWith(p + ' ->'));
    if (!matches) continue;
    const files = Array.isArray(value?.files) ? value.files
      : Array.isArray(value) ? value : [];
    for (const f of files) {
      const norm = normalizeChunkRef(f);
      if (norm) out.add(norm);
    }
  }
  return [...out];
}

// ─── 7) Build per-route manifest ────────────────────────────────
const routesData = {};
const diagnostics = {};
const routeLoadableSources = {
  '/ads/[id]': ['components/ads/AdDetailSection.tsx'],
  '/login': ['app/(auth)/login/page.tsx'],
  '/register': ['app/(auth)/register/page.tsx'],
  '/forgot-password': ['app/(auth)/forgot-password/page.tsx'],
  '/reset-password': ['app/(auth)/reset-password/page.tsx'],
  '/verify-email': ['app/(auth)/verify-email/page.tsx'],
  '/': ['components/home/HomePageContent.tsx'],
  '/activity': ['components/profile/ActivityTabsHub.tsx'],
  '/account/customers': ['app/(protected)/account/customers/page.tsx'],
  '/account/sales/debts': ['app/(protected)/account/sales/debts/page.tsx'],
  '/account/sales/installments': ['app/(protected)/account/sales/installments/page.tsx'],
  '/account/sales': ['components/sales/SalesTabsHub.tsx'],
  '/following': ['app/(protected)/following/page.tsx'],
  '/ads/create': ['components/ads/CreateAdGate.tsx'],
  '/my-ads/[id]/edit': ['app/(protected)/my-ads/[id]/edit/page.tsx'],
  '/my-services/[id]/edit': ['app/(protected)/my-services/[id]/edit/page.tsx'],
  '/my-services/new': ['components/services/CreateServiceListingGate.tsx'],
  '/my-store/products/[id]/edit': ['app/(protected)/my-store/products/[id]/edit/page.tsx'],
  '/my-store/products/new': ['components/stores/CreateProductGate.tsx'],
  '/favorites': ['components/profile/FavoritesTabs.tsx'],
  '/messages': ['app/(protected)/messages/layout.tsx', 'components/messages/ChatWindow.tsx'],
  '/messages/[id]': [
    'app/(protected)/messages/layout.tsx',
    'components/messages/ChatWindow.tsx',
    'components/messages/MessageMedia.tsx',
  ],
  '/notifications': ['components/notifications/NotificationsPage.tsx'],
  '/profile/[id]': ['components/profile/ProfileTabsSection.tsx'],
  '/settings': ['components/settings/SettingsTabsHub.tsx'],
  '/my-store': ['components/stores/MyStoreTabsHub.tsx'],
  '/my-services': ['components/services/MyServicesTabsHub.tsx'],
  '/saved-searches': ['app/(protected)/saved-searches/page.tsx'],
  '/requests/new': ['app/(protected)/requests/new/page.tsx'],
  '/requests/me': ['app/(protected)/requests/me/page.tsx'],
  '/requests/offers': ['app/(protected)/requests/offers/page.tsx'],
  '/requests/[id]': ['app/(public)/requests/[id]/page.tsx'],
  '/service-requests/[id]': ['app/(protected)/service-requests/[id]/page.tsx'],
  '/stories': ['app/(protected)/stories/page.tsx'],
  '/stores': ['components/stores/StoreStorefront.tsx'],
};
for (const route of routes) {
  const sourcePath = urlToSource.get(route) || null;
  const fromAppBuild = chunksFromAppBuild(route);
  const fromStatic = chunksFromStaticScan(sourcePath);
  const fromLoadable = [
    ...chunksFromReactLoadable(sourcePath),
    ...(routeLoadableSources[route] ?? []).flatMap(chunksFromReactLoadable),
  ];
  const set = new Set([...fromAppBuild, ...fromStatic, ...fromLoadable]);
  routesData[route] = { assets: [...set].sort(), auth: personalRoutes.includes(route) };
  diagnostics[route] = {
    appBuild: fromAppBuild.length,
    staticScan: fromStatic.length,
    reactLoadable: fromLoadable.length,
    source: sourcePath,
  };
}

const withChunks = Object.values(routesData).filter((r) => r.assets.length > 0).length;
const totalAssets = Object.values(routesData).reduce((a, r) => a + r.assets.length, 0);
console.log(`[warming-manifest] routes with chunks: ${withChunks}/${routes.length}`);
console.log(`[warming-manifest] total assets: ${totalAssets}`);

if (withChunks === 0) {
  const hasNextBuild = fs.existsSync(path.join(root, '.next'));
  if (hasNextBuild) {
    console.error('[warming-manifest] ERROR: no route chunks discovered after a real build; refusing to publish a broken manifest.');
    try { fs.unlinkSync(outputPath); } catch { /* not present */ }
  } else {
    console.log('[warming-manifest] pre-build run — keeping existing manifest (if any).');
  }
  if (process.env.WARMING_DEBUG) {
    console.log('[warming-manifest] diagnostics:', JSON.stringify(diagnostics, null, 2));
  }
  // A real build with zero discovered chunks must fail the build. Previously
  // this exited successfully after deleting the manifest, allowing deployment
  // to ship a missing /warming-manifest.json and only fail later in clients.
  process.exit(hasNextBuild ? 1 : 0);
}

const sources = [];
if (appBuildManifest) sources.push('app-build-manifest');
if (appPathsManifest) sources.push('app-paths-manifest');
if (reactLoadableManifest) sources.push('react-loadable-manifest');
if (buildManifest) sources.push('build-manifest');
if (sources.length === 0) sources.push('route-source-only');

fs.writeFileSync(outputPath, `${JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  source: sources.join('+'),
  routes: routesData,
}, null, 2)}\n`);

console.log(
  `[warming-manifest] wrote ${routes.length} routes ` +
  `(${withChunks} with chunks) -> ${path.relative(root, outputPath)}`
);
if (process.env.WARMING_DEBUG) {
  console.log('[warming-manifest] diagnostics:', JSON.stringify(diagnostics, null, 2));
}
