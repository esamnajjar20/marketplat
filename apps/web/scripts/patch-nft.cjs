#!/usr/bin/env node
/**
 * Post-next-build NFT patcher.
 *
 * Next.js 15.5.x under pnpm monorepo emits next-server.js.nft.json with only
 * ~30 traced files, omitting all sibling files that next-server.js requires
 * relatively (./node-environment, ./request-meta, ../shared/lib/utils, ...).
 *
 * @opennextjs/cloudflare then copies only what is listed in the NFT and esbuild
 * fails with 54 "Could not resolve" errors during the bundle step.
 *
 * This script injects every .js/.json file from node_modules/next/dist/{server,
 * shared,lib} into the .nft.json so copyTracedFiles places them on disk before
 * esbuild runs. Idempotent.
 */
const fs = require('node:fs');
const path = require('node:path');

const cwd = process.cwd();
const nftPath = path.join(cwd, '.next', 'next-server.js.nft.json');

if (!fs.existsSync(nftPath)) {
  console.log('[patch-nft] no next-server.js.nft.json — skipping');
  process.exit(0);
}

// Locate monorepo root (walk up until pnpm-workspace.yaml found)
let repoRoot = cwd;
while (repoRoot !== path.dirname(repoRoot)) {
  if (fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) break;
  repoRoot = path.dirname(repoRoot);
}

const nextDistCandidates = [
  path.join(cwd, 'node_modules', 'next', 'dist'),
  path.join(repoRoot, 'node_modules', 'next', 'dist'),
];

const nextDist = nextDistCandidates.find((p) => fs.existsSync(p));
if (!nextDist) {
  console.log('[patch-nft] next/dist not found — skipping');
  process.exit(0);
}

const nftDir = path.dirname(nftPath);
const data = JSON.parse(fs.readFileSync(nftPath, 'utf8'));
const files = new Set(data.files || []);
const before = files.size;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) {
      if (/\.(js|json|mjs|cjs|wasm|ttf|woff2?|bin|node)$/.test(entry.name)) {
        const rel = path.relative(nftDir, full);
        files.add(rel);
      }
    }
  }
}

for (const sub of ['server', 'shared', 'lib', 'compiled', 'pages']) {
  const p = path.join(nextDist, sub);
  if (fs.existsSync(p)) walk(p);
}


// Safety net: ensure @vercel/og is in the trace even if next/dist/compiled
// was not walked (older Next.js layout or pnpm symlinks).
const ogCandidates = [
  path.join(repoRoot, 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og'),
  path.join(repoRoot, 'node_modules', '.pnpm', 'next@15.5.28_@babel+core@7.29.7_@opentelemetry+api@1.10.0_@playwright+test@1.64.1_@type_c434cb6fc8d9e61fc361e1614fc1c617', 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og'),
];
for (const ogDir of ogCandidates) {
  if (fs.existsSync(ogDir)) {
    walk(ogDir);
    break;
  }
}


// Exclude sharp native binaries — Workers cannot run .node files.
let _sharpFilterApplied = false;
for (const f of Array.from(files)) {
  if (/\bsharp\b|@img\/sharp|sharp-.*\.node/i.test(f)) {
    files.delete(f);
    _sharpFilterApplied = true;
  }
}
if (_sharpFilterApplied) console.log('[patch-nft] filtered sharp native binaries');

data.files = Array.from(files).sort();
fs.writeFileSync(nftPath, JSON.stringify(data, null, 2));

const added = files.size - before;
console.log(`[patch-nft] added ${added} files, total ${files.size}`);


// ─── Mirror deep standalone .next into flat standalone .next ─────────
// With outputFileTracingRoot pointing at the monorepo root, Next.js's
// output:'standalone' produces:
//     .next/standalone/apps/web/.next/{BUILD_ID,server/,static/,...}
// but @opennextjs/aws expects the flat layout:
//     .next/standalone/.next/{BUILD_ID,server/,static/,...}
// We mirror everything (except the standalone folder itself, to avoid
// recursion) so pages-manifest.json, BUILD_ID, static/, server/, and any
// future file are all available where opennext expects them.
const standaloneRoot = path.join(cwd, '.next', 'standalone');
const deepAppRoot = path.join(standaloneRoot, 'apps', 'web', '.next');
const flatNextRoot = path.join(standaloneRoot, '.next');

function mirrorTree(src, dst, skipNames) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames && skipNames.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      count += mirrorTree(s, d, skipNames);
    } else if (entry.isFile()) {
      if (!fs.existsSync(d)) {
        fs.copyFileSync(s, d);
        count += 1;
      }
    }
  }
  return count;
}

if (fs.existsSync(standaloneRoot)) {
  let copied = 0;
  if (fs.existsSync(deepAppRoot)) {
    // Mirror from deep location (outputFileTracingRoot layout)
    copied = mirrorTree(deepAppRoot, flatNextRoot, ['standalone']);
    // Also overlay direct .next/ files (BUILD_ID etc. may only exist here)
    copied += mirrorTree(path.join(cwd, '.next'), flatNextRoot, ['standalone', 'cache']);
  } else {
    // Fallback: copy top-level manifests directly from .next/
    const src = path.join(cwd, '.next');
    for (const f of ['BUILD_ID', 'pages-manifest.json', 'app-paths-manifest.json',
                     'routes-manifest.json', 'middleware-manifest.json']) {
      const s = path.join(src, f);
      const d = path.join(flatNextRoot, f);
      if (fs.existsSync(s) && !fs.existsSync(d)) {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
        copied += 1;
      }
    }
  }
  if (copied > 0) {
    console.log(`[patch-nft] mirrored ${copied} file(s) into flat standalone .next`);


// ─── Patch getMiddlewareManifest to return null (no middleware) ─────
// Next.js internal method bypasses the loadManifest helper and calls
// require(this.middlewareManifestPath) directly. esbuild cannot resolve
// the dynamic path, so it throws at runtime (Issue #1258, #894).
// Since this app has no middleware.ts, returning null is safe.
const handlerFiles = [
  path.join(cwd, '.open-next', 'server-functions', 'default', 'handler.mjs'),
  path.join(cwd, '.open-next', 'server-functions', 'default', 'apps', 'web', 'handler.mjs'),
];
for (const handlerPath of handlerFiles) {
  if (!fs.existsSync(handlerPath)) continue;
  let content = fs.readFileSync(handlerPath, 'utf8');
  if (content.includes('getMiddlewareManifest patched')) continue;
  const patched = content.replace(
    /getMiddlewareManifest\(\)\s*\{\s*return this\.minimalMode\s*\?\s*null\s*:\s*require\(this\.middlewareManifestPath\)\s*;?\s*\}/g,
    'getMiddlewareManifest(){/* getMiddlewareManifest patched */return null}'
  );
  if (patched !== content) {
    fs.writeFileSync(handlerPath, patched);
    console.log('[patch-nft] getMiddlewareManifest patched in ' + path.relative(cwd, handlerPath));
  }
}
  } else {
    console.log('[patch-nft] flat standalone already populated');
  }
} else {
  console.log('[patch-nft] no standalone tree — skipping standalone mirror');
}
