/**
 * Phase 1: offline/cache inventory and drift report. Dependency-free; does not mutate source.
 * Run: npm run offline:inventory
 * Run with --write to refresh docs/OFFLINE_SYSTEM_PHASE1_INVENTORY.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const args = new Set(process.argv.slice(2));
const sourceExt = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const ignoredDirs = new Set(['node_modules', '.next', 'coverage', 'dist', 'build', 'playwright-report', 'test-results']);
const roots = [
  frontendRoot,
  path.join(repoRoot, 'shared'),
  path.join(repoRoot, 'backend', 'src'),
  path.join(repoRoot, 'workers'),
];
const allSources = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!ignoredDirs.has(item.name) && !item.name.startsWith('.')) walk(absolute);
    } else if (sourceExt.test(item.name) && !absolute.includes(`${path.sep}__tests__${path.sep}`) && !absolute.includes(`${path.sep}e2e${path.sep}`) && !absolute.includes(`${path.sep}scripts${path.sep}`)) {
      allSources.push(absolute);
    }
  }
}
for (const root of roots) walk(root);

const relevantPattern = /(?:offline|cache|warm|queue|sync|network|service.?worker|\bsw\.js\b)/i;
const relevant = new Set(allSources.filter((file) => relevantPattern.test(path.basename(file)) || /(?:^|[\\/])offline(?:[\\/]|$)/i.test(file)));
const importers = new Map([...relevant].map((file) => [file, new Set()]));
const importPattern = /(?:\bfrom\s*|\bimport\s*\()(['"])([^'"]+)\1/g;
function resolveImport(specifier, importer) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(frontendRoot, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(importer), specifier);
  else return null;
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map((ext) => `${base}${ext}`), ...['index.ts', 'index.tsx', 'index.js'].map((name) => path.join(base, name))];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}
for (const source of allSources) {
  const content = fs.readFileSync(source, 'utf8');
  for (const match of content.matchAll(importPattern)) {
    const target = resolveImport(match[2], source);
    if (target && importers.has(target) && target !== source) importers.get(target).add(path.relative(repoRoot, source).replaceAll(path.sep, '/'));
  }
}

function category(file) {
  const rel = path.relative(repoRoot, file).replaceAll(path.sep, '/');
  if (/components\/|\/hooks\//.test(rel)) return 'UI and hooks';
  if (/warming|warmup|Warmup/i.test(path.basename(file)) || /warming/i.test(rel)) return 'Warming and route preparation';
  if (/Queue|queue|Sync|sync|Draft|draft|OperationId/i.test(path.basename(file))) return 'Mutations, drafts, queues and sync';
  if (/cache|Cache|Freshness|freshness|SavedEntities|SearchIndex/i.test(path.basename(file))) return 'Data cache and freshness';
  if (/network|Network|connection|Connection|offlineError|swToken|service.?worker/i.test(path.basename(file))) return 'Connectivity and lifecycle';
  if (/shared\/cache|cache-policy|cache-contract|public\/sw/i.test(rel)) return 'Shared contracts and Service Worker';
  return 'Other offline-related';
}
const groups = new Map();
for (const file of [...relevant].sort()) {
  const name = category(file);
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(file);
}
const rel = (file) => path.relative(repoRoot, file).replaceAll(path.sep, '/');
const top = [...relevant].map((file) => ({ file, count: importers.get(file)?.size ?? 0 })).sort((a, b) => b.count - a.count || rel(a.file).localeCompare(rel(b.file)));
const candidates = top.filter(({ file, count }) => {
  const relative = rel(file);
  const runtimeOwned = /^(?:frontend\/(?:lib|components|hooks|providers|app)\/|backend\/src\/)/.test(relative);
  const knownEntrypointOrBarrel = /frontend\/app\/offline\/page\.tsx$|frontend\/lib\/offline\/index\.ts$/.test(relative);
  return count === 0 && runtimeOwned && !knownEntrypointOrBarrel;
});
const offlineQueryCachePath = path.join(frontendRoot, 'lib', 'offlineQueryCache.ts');
const offlineQueryCache = fs.readFileSync(offlineQueryCachePath, 'utf8');
const phase12Audit = fs.readFileSync(path.join(frontendRoot, 'scripts', 'offline-phase12-audit.mjs'), 'utf8');
const findings = [];
if (/OFFLINE_QUERY_MAX_ENTRY_BYTES\s*=\s*20\s*\*\s*1024/.test(offlineQueryCache)) findings.push({ severity: 'high', id: 'CACHE-01', title: 'Per-query offline snapshot cap remains 20 KiB', evidence: '`frontend/lib/offlineQueryCache.ts` defines `OFFLINE_QUERY_MAX_ENTRY_BYTES = 20 * 1024`; the existing audit documentation claims the limit was raised to 64 KiB.' });
if (!/actualBytes\s*===\s*entry\.bytes/.test(offlineQueryCache)) findings.push({ severity: 'high', id: 'CACHE-02', title: 'Restore does not recompute serialized payload size', evidence: 'Restore trusts stored `entry.bytes`; it does not independently verify actual serialized bytes against the recorded value and entry cap.' });
if (!/PUBLIC_CHILD_KEYS/.test(offlineQueryCache) || !/third\s*!==\s*'me'/.test(offlineQueryCache) || !/PRIVATE_OR_CONTEXTUAL_PARAM/.test(offlineQueryCache)) findings.push({ severity: 'critical', id: 'CACHE-03', title: 'Offline query persistence relies on broad public prefixes', evidence: 'Persistability must use a shape-aware allowlist and reject private or contextual siblings under otherwise public query roots.' });
if (!/\['products',\s*'me'/.test(fs.readFileSync(path.join(frontendRoot, '__tests__', 'unit', 'lib', 'offlineQueryCache.test.ts'), 'utf8'))) findings.push({ severity: 'high', id: 'TEST-01', title: 'Private/admin sibling query-key regression cases are absent', evidence: 'The current unit suite covers top-level private roots but not sensitive descendants under public prefixes.' });
if (/PUBLIC_CHILD_KEYS/.test(phase12Audit) && (!/PUBLIC_CHILD_KEYS/.test(offlineQueryCache) || !/actualBytes\s*===\s*entry\.bytes/.test(offlineQueryCache) || !/OFFLINE_QUERY_MAX_ENTRY_BYTES\s*=\s*64\s*\*\s*1024/.test(offlineQueryCache))) findings.push({ severity: 'high', id: 'AUDIT-01', title: 'Static audit expectations drift from implementation', evidence: '`offline-phase12-audit.mjs` expects shape-aware key filtering, payload-size verification, and a 64 KiB per-entry cap.' });

const lines = [
  '# Offline System — Phase 1 Inventory and Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Scope and method',
  '',
  `Static import inventory of frontend/shared/backend runtime source files. Scanned ${allSources.length} source files and identified ${relevant.size} offline/cache/network/queue/warming-related modules. Import counts are static approximations: runtime registration, framework route entrypoints, worker entrypoints, dynamic imports, and string-based loading may not appear as ordinary imports. No source modules are deleted or rewritten by this script.`,
  '',
  '## Inventory by responsibility',
  '',
];
for (const [name, files] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`### ${name} (${files.length})`, '');
  for (const file of files.sort()) {
    const count = importers.get(file)?.size ?? 0;
    const consumers = [...(importers.get(file) ?? [])].sort();
    lines.push(`- [${count === 0 ? '0m' : '0m'}[0m [0m[0m[0m${rel(file)} — ${count} static importer${count === 1 ? '' : 's'}${consumers.length ? `; used by ${consumers.slice(0, 4).join(', ')}${consumers.length > 4 ? `, and ${consumers.length - 4} more` : ''}` : ''}`);
  }
  lines.push('');
}
lines.push('## Findings requiring action', '');
if (findings.length === 0) lines.push('- No known Phase 1 guardrail mismatch detected by the current checks.');
else for (const finding of findings) lines.push(`- **${finding.severity.toUpperCase()} — ${finding.id}: ${finding.title}.** ${finding.evidence}`);
lines.push('', '## Zero-static-import candidates (review only; do not auto-delete)', '');
if (candidates.length === 0) lines.push('- None detected.');
else for (const { file } of candidates) lines.push(`- ${rel(file)} — zero static importers in the scanned source set. Check framework entrypoints, tests, side effects, and dynamic usage before deciding whether it is dead code.`);
lines.push('', '## Phase 2 updates', '',
  '- Replaced broad contract-prefix persistence with a shape-aware allowlist for known public query-key forms. Private/admin siblings, user-owned resources, stock data, search text, coordinates, and the identity-bearing personalized home-feed branch are excluded.',
  '- Restore now checks key identity, timestamp bounds, actual stable-serialized UTF-8 byte size, the recorded byte count, and the 64 KiB per-entry cap; a corrupt row is rejected independently.',
  '- Preserved the 500-entry, 5 MiB aggregate, and seven-day limits. Added regression coverage for private/admin sibling keys, contextual params, 30 KiB payloads, oversize payloads, corrupted byte counts, and invalid timestamps.',
  '- Static phase 2 guardrail and dependency-free phase 1 guardrail pass. Vitest, full TypeScript validation, production build, and real-browser offline tests still require installed project dependencies and a browser run.',
  '',
  '## Phase 1 decisions', '',
  '1. Do not merge or delete modules yet; preserve current behavior while recording consumers and contracts.',
  '2. The initial query-cache persistence mismatch was addressed in Phase 2; remaining integration work must verify logout/account switching and queue idempotency.',
  '3. Static audits are guardrails, not proof of runtime offline behavior.',
  '4. Do not remove zero-static-import candidates without checking framework entrypoints, tests, side effects, and dynamic usage.',
  '5. Run browser tests only against a built app with a real browser context.',
  '',
  '## Limitations', '',
  'This report is source-level only. It does not prove runtime behavior, execute Vitest, perform a TypeScript project check, build Next.js, or test offline mode in a browser. Import counts are not a safe basis for deleting code.'
);
const markdown = lines.join('\n').replaceAll(/\u001b\[[0-9;]*m/g, '') + '\n';
console.log(`Offline inventory: ${allSources.length} source files scanned; ${relevant.size} relevant modules; ${findings.length} findings; ${candidates.length} zero-static-import candidates.`);
for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.id}: ${finding.title}`);
console.log(`Grouped module counts: ${[...groups.entries()].map(([name, files]) => `${name}=${files.length}`).join(', ')}`);
if (args.has('--write')) {
  const output = path.join(repoRoot, 'OFFLINE_SYSTEM_PHASE1_INVENTORY.md');
  fs.writeFileSync(output, markdown);
  console.log(`Wrote ${path.relative(repoRoot, output)}`);
}
