/**
 * W5 — build-time warming manifest.
 *
 * Produces public/warming-manifest.json from routes approved by
 * offlineRouteShells.ts plus whatever chunk manifests Next.js 16 emits.
 *
 * Next 16 removed `.next/server/app-build-manifest.json` (which used to map
 * route → chunks). This script tries multiple Next manifest shapes and falls
 * back to scanning `.next/static/chunks/` directly. The manifest is advisory:
 * runtime warming still verifies every asset before promoting a route.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'lib/offlineRouteShells.ts'), 'utf8');
const outputPath = path.join(root, 'public/warming-manifest.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

// ─── 1) Extract route lists from source ─────────────────────────
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

// ─── 2) Read every Next manifest shape we can find ──────────────
function readJson(relPath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
  } catch {
    return null;
  }
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

const findings = {
  appBuild: appBuildManifest ? appBuildManifest.path : null,
  appPaths: !!appPathsManifest,
  reactLoadable: !!reactLoadableManifest,
  buildManifest: !!buildManifest,
};
console.log('[warming-manifest] manifests found:', findings);

// ─── 3) URL → source path map (from app-paths-manifest) ─────────
const urlToSource = new Map();
if (appPathsManifest && typeof appPathsManifest === 'object') {
  for (const [key, value] of Object.entries(appPathsManifest)) {
    if (typeof value !== 'string') continue;
    // keys look like "/products/page" or "/page"
    if (key === '/page') {
      urlToSource.set('/', value);
    } else if (key.endsWith('/page')) {
      urlToSource.set(key.slice(0, -'/page'.length), value);
    }
  }
}
console.log(`[warming-manifest] URL→source entries: ${urlToSource.size}`);

// ─── 4) Direct chunks from app-build-manifest (legacy path) ─────
function chunksFromAppBuild(route) {
  if (!appBuildManifest || !appBuildManifest.data) return [];
  const pages = appBuildManifest.data.pages ?? appBuildManifest.data.app ?? {};
  const clean = route === '/' ? '/' : route.replace(/\/$/, '');
  const candidates = [
    clean,
    clean === '/' ? '/page' : `${clean}/page`,
  ];
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
      // Sometimes nested
      for (const v of Object.values(entry)) {
        if (Array.isArray(v)) {
          for (const chunk of v) {
            if (typeof chunk === 'string') {
              out.add(chunk.startsWith('/') ? chunk : `/${chunk}`);
            }
          }
        }
      }
    }
  }
  return [...out];
}

// ─── 5) Direct chunks by scanning .next/static/chunks/ ──────────
function chunksFromStaticScan(sourcePath) {
  if (!sourcePath) return [];
  // sourcePath is like "./app/(public)/products/page.js"
  const clean = sourcePath.replace(/^\.\//, '').replace(/\.js$/, '');
  // dir of the page chunk: ".next/static/chunks/app/(public)/products"
  const sourceDir = clean.replace(/\/page$/, '');
  const scanDirs = [
    path.join('.next/static/chunks', sourceDir),
    // Also try parent layout dirs
    path.join('.next/static/chunks', sourceDir.split('/').slice(0, -1).join('/')),
  ];

  const out = new Set();
  for (const dir of scanDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
        // Skip server-only chunks
        if (f.includes('_server') || f.endsWith('.node.js')) continue;
        const rel = path.relative('.next/static/chunks', path.join(dir, f));
        out.add('/_next/static/chunks/' + rel.split(path.sep).join('/'));
      }
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

// ─── 6) Lazy chunks from react-loadable-manifest ────────────────
function chunksFromReactLoadable(sourcePath) {
  if (!reactLoadableManifest || !sourcePath) return [];
  const key = sourcePath.replace(/^\.\//, '');
  const entry = reactLoadableManifest[key];
  if (!entry || typeof entry !== 'object') return [];
  const out = new Set();
  for (const chunks of Object.values(entry)) {
    if (!Array.isArray(chunks)) continue;
    for (const c of chunks) {
      if (typeof c !== 'string') continue;
      const norm = c.startsWith('_next/') ? '/' + c : c.startsWith('/_next/') ? c : null;
      if (norm) out.add(norm);
    }
  }
  return [...out];
}

// ─── 7) Build per-route manifest ────────────────────────────────
const routesData = {};
for (const route of routes) {
  const sourcePath = urlToSource.get(route) || null;

  const set = new Set([
    ...chunksFromAppBuild(route),
    ...chunksFromStaticScan(sourcePath),
    ...chunksFromReactLoadable(sourcePath),
  ]);

  routesData[route] = {
    assets: [...set].sort(),
    auth: personalRoutes.includes(route),
  };
}

// ─── 8) Diagnostic summary ──────────────────────────────────────
const withChunks = Object.values(routesData).filter((r) => r.assets.length > 0).length;
console.log(`[warming-manifest] routes with chunks: ${withChunks}/${routes.length}`);

if (withChunks === 0) {
  console.warn(
    '[warming-manifest] WARN: no chunks discovered — ' +
    'HTML extraction will still work at runtime.'
  );
  // don't write empty manifest
  try { fs.unlinkSync(outputPath); } catch { /* not present */ }
  process.exit(0);
}

// ─── 9) Write manifest ──────────────────────────────────────────
const sources = [];
if (appBuildManifest) sources.push('app-build-manifest');
if (appPathsManifest) sources.push('app-paths-manifest');
if (reactLoadableManifest) sources.push('react-loadable-manifest');
if (buildManifest) sources.push('build-manifest');
if (sources.length === 0) sources.push('route-source-only');

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: sources.join('+'),
  routes: routesData,
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `[warming-manifest] wrote ${routes.length} routes ` +
  `(${withChunks} with chunks) -> ${path.relative(root, outputPath)}`
);
