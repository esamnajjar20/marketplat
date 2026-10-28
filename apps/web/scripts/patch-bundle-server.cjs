#!/usr/bin/env node
/**
 * Postinstall patcher for @opennextjs/cloudflare's bundle-server.js.
 *
 * OpenNext's esbuild config doesn't respect Next.js's `serverExternalPackages`
 * for `sharp`. Cloudflare Workers cannot bundle `sharp`'s native `.node`
 * binaries, so we inject `external: [sharp, @img/sharp-*]` into the esbuild
 * build() options. Idempotent — safe to run multiple times.
 *
 * Without this, `pnpm install` on Cloudflare wipes the patch and the build
 * fails with 4 "Could not resolve sharp-*-*.node" errors during
 * "Bundling the OpenNext server...".
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const SHARP_EXTERNALS = [
  'sharp',
  '@img/sharp-linux-x64',
  '@img/sharp-linuxmusl-x64',
  '@img/sharp-linux-arm64',
  '@img/sharp-linux-arm',
  '@img/sharp-darwin-arm64',
  '@img/sharp-darwin-x64',
  '@img/sharp-win32-x64',
  '@img/sharp-win32-ia32',
  '@img/sharp-win32-arm64',
  '@img/sharp-linux-ppc64',
  '@img/sharp-linux-s390x',
  '@img/sharp-linux-riscv64',
  '@img/sharp-linuxmusl-arm64',
];

function findBundleServer() {
  const candidates = [
    // hoisted layout (node-linker=hoisted)
    path.join(process.cwd(), 'node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js'),
    path.join(process.cwd(), '../node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js'),
    path.join(process.cwd(), '../../node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js'),
    // pnpm symlinked layout
    path.join(process.cwd(), 'node_modules/.pnpm'),
    path.join(process.cwd(), '../node_modules/.pnpm'),
    path.join(process.cwd(), '../../node_modules/.pnpm'),
  ];
  // 1) hoisted: direct paths
  for (let i = 0; i < 3; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  // 2) pnpm: scan .pnpm/* dirs
  for (let i = 3; i < candidates.length; i++) {
    const pnpmDir = candidates[i];
    if (!fs.existsSync(pnpmDir)) continue;
    const entries = fs.readdirSync(pnpmDir).filter((e) => e.startsWith('@opennextjs+cloudflare@'));
    for (const entry of entries) {
      const candidate = path.join(pnpmDir, entry, 'node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const target = findBundleServer();
if (!target) {
  console.log('[patch-bundle-server] bundle-server.js not found — skipping');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');

// Idempotency: already patched?
if (src.includes("'@img/sharp-linux-x64'")) {
  console.log('[patch-bundle-server] already patched');
  process.exit(0);
}

const externalsStr = SHARP_EXTERNALS.map((s) => `'${s}'`).join(', ');

// Case 1: external: [...] exists → extend it
if (/external:\s*\[/.test(src)) {
  src = src.replace(
    /external:\s*\[([^\]]*)\]/,
    (_, inner) => `external: [${inner.trim()}${inner.trim() ? ', ' : ''}${externalsStr}]`
  );
  fs.writeFileSync(target, src);
  console.log(`[patch-bundle-server] extended existing external in ${path.relative(process.cwd(), target)}`);
  process.exit(0);
}

// Case 2: no external → inject before plugins:
if (/plugins:\s*\[/.test(src)) {
  src = src.replace(/plugins:\s*\[/, `external: [${externalsStr}],\n        plugins: [`);
  fs.writeFileSync(target, src);
  console.log(`[patch-bundle-server] injected external into ${path.relative(process.cwd(), target)}`);


// ─── Patch loadManifest to return {} instead of throwing ────────────
// Next.js 15.5+ introduces new optional manifests (preview-props.json,
// prefetch-hints.json) that the build-time glob scan may not find.
// The patched loadManifest throws "Unexpected loadManifest(...) call!"
// at runtime, crashing every dynamic route with 500 (Issues #1141, #1355).
try {
  const loadManifestPath = path.join(
    path.dirname(target),
    "patches",
    "plugins",
    "load-manifest.js"
  );
  if (fs.existsSync(loadManifestPath)) {
    let lm = fs.readFileSync(loadManifestPath, "utf8");
    if (!lm.includes("loadManifest patched")) {
      lm = lm.replace(
        /throw new Error\(`Unexpected loadManifest\(\\$\\{.*?\\}\) call!`\)/g,
        "return {}"
      );
      fs.writeFileSync(loadManifestPath, lm);
      console.log("[patch-bundle-server] loadManifest patched to return {}");
    }
  }
} catch (e) {
  console.warn("[patch-bundle-server] loadManifest patch skipped:", e.message);
}
  process.exit(0);
}

console.log('[patch-bundle-server] could not find anchor (external/plugins) — skipping');
process.exit(0);
