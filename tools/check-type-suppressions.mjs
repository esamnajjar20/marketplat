#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['frontend', 'apps', 'packages', 'workers', 'tools'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);
const ignoredDirectories = new Set([
  '.git', '.next', '.expo', 'android', 'build', 'coverage', 'dist',
  'node_modules', 'out', 'vendor',
]);

// Baseline captured from the audited project. Existing suppressions are tolerated
// temporarily, but this gate prevents introducing new file-wide type-check bypasses.
const baseline = new Map(Object.entries({
  'frontend/scripts/api-batching-phase8-audit.mts': 1,
  'frontend/scripts/bundle-report.mts': 1,
  'frontend/scripts/cache-contract-audit.mts': 1,
  'frontend/scripts/cache-layer-audit.mts': 1,
  'frontend/scripts/export-http-request-inventory.cts': 1,
  'frontend/scripts/generate-warming-manifest.mts': 1,
  'frontend/scripts/hidden-architecture-fixes-audit.mts': 1,
  'frontend/scripts/http-request-phase3-audit.mts': 1,
  'frontend/scripts/loading-system-audit.mts': 1,
  'frontend/scripts/loading-unification-audit.mts': 1,
  'frontend/scripts/navigation-integrity-audit.mts': 1,
  'frontend/scripts/offline-phase6-ux-audit.mts': 1,
  'frontend/scripts/offline-phase8-idempotency-scope-audit.mts': 1,
  'frontend/scripts/offline-system-inventory.mts': 1,
  'frontend/scripts/offline-ux-phases-5-6-audit.mts': 1,
  'frontend/scripts/package-script-reference-audit.mts': 1,
  'frontend/scripts/query-invalidation-audit.mts': 1,
  'frontend/scripts/query-key-types-audit.cts': 1,
  'frontend/scripts/render-audit.mts': 1,
  'frontend/scripts/responsive-visual-consistency-audit.mts': 1,
  'frontend/scripts/route-navigation-loading-audit.mts': 1,
  'frontend/scripts/rsc-boundary-phase4-audit.mts': 1,
  'frontend/scripts/sw-native-url-runtime-audit.mts': 1,
  'frontend/scripts/user-journey-shell-audit.mts': 1,
  'frontend/scripts/virtualization-audit.mts': 1,
  'apps/api/scripts/http-payload-phase4-audit.mts': 1,
  'apps/api/scripts/offline-idempotency-complete-audit.mts': 1,
  'apps/api/scripts/offline-idempotency-concurrency-audit.mts': 1,
  'apps/api/scripts/offline-idempotency-phase10-audit.mts': 1,
  'apps/api/scripts/prisma-query-phase5-audit.mts': 1,
  'apps/api/scripts/prisma-query-phase6-audit.mts': 1,
  'apps/api/scripts/profile-prisma-metrics.mts': 1,
  'apps/mobile/scripts/lint-mobile.mts': 1,
  'apps/mobile/scripts/report-token-bypass.mts': 1,
  'apps/mobile/scripts/run-all-verifications.mts': 1,
  'apps/mobile/scripts/verify-audit-round-two.mts': 1,
  'apps/mobile/scripts/verify-design-system-cross-platform.mts': 1,
  'apps/mobile/scripts/verify-design-tokens-no-raw-hex.mts': 1,
  'apps/mobile/scripts/verify-discovery-phase2.mts': 1,
  'apps/mobile/scripts/verify-discovery-phase9-fixes.mts': 1,
  'apps/mobile/scripts/verify-feature-orders.mts': 1,
  'apps/mobile/scripts/verify-feature-remaining-account-pages.mts': 1,
  'apps/mobile/scripts/verify-mobile-unification-round3.mts': 1,
  'apps/mobile/scripts/verify-mobile-unification-round5.mts': 1,
  'apps/mobile/scripts/verify-navigation-information-hierarchy.mts': 1,
  'apps/mobile/scripts/verify-navigation-policy.mts': 1,
  'apps/mobile/scripts/verify-offline-first-request-offer-outbox.mts': 1,
  'apps/mobile/scripts/verify-offline-support-matrix.mts': 1,
  'apps/mobile/scripts/verify-phase2-build-config.mts': 1,
  'apps/mobile/scripts/verify-phase4-offline-security.mts': 1,
  'apps/mobile/scripts/verify-phase78.mts': 1,
  'apps/mobile/scripts/verify-phase79.mts': 1,
  'apps/mobile/scripts/verify-shared-data-lifecycle.mts': 1,
  'apps/mobile/scripts/verify-theme-system.mts': 1,
  'apps/mobile/scripts/verify-web-mobile-parity.mts': 1,
  'apps/mobile/src/storage/__tests__/draft-operation-queue.test.mts': 1,
  'apps/mobile/src/storage/__tests__/outbox-transport-contract.test.mts': 1,
  'workers/cf-api-proxy/cache-policy.test.mts': 1,
  'workers/cf-api-proxy/cache-probe.mts': 1,
  'tools/user-simulator/src/runner.mts': 1,
  'tools/user-simulator/src/scenarios.mts': 1,
  'tools/user-simulator/src/server.mts': 1,
  'tools/user-simulator/src/store.mts': 1,
  'tools/user-simulator/test/scenarios.test.mts': 1,
  'tools/user-simulator/test/store.test.mts': 1,
  'tools/verify-prisma-layout.mts': 1,
}));

const findings = [];
let scannedFiles = 0;

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) continue;

    scannedFiles += 1;
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    const source = await readFile(absolutePath, 'utf8');
    const count = [...source.matchAll(/@ts-nocheck\b/g)].length;
    const allowed = baseline.get(relativePath) ?? 0;
    if (count > allowed) {
      findings.push(`${relativePath}: found ${count} @ts-nocheck directive(s); baseline allows ${allowed}`);
    }
  }
}

for (const sourceRoot of sourceRoots) {
  await walk(path.join(root, sourceRoot));
}

if (findings.length > 0) {
  console.error(`Type-suppression guard failed (${findings.length} new file-wide suppression(s)):`);
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else {
  const baselineCount = [...baseline.values()].reduce((total, count) => total + count, 0);
  console.log(`Type-suppression guard passed: ${scannedFiles} TypeScript files scanned; no new @ts-nocheck directives (baseline: ${baselineCount}).`);
}
