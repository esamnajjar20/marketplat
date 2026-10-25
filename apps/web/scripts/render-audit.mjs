#!/usr/bin/env node

/**
 * Static rendering-hotspot baseline.
 *
 * This is intentionally conservative: it counts patterns that are useful for
 * tracking the architecture, but it does not pretend to replace React DevTools
 * Profiler runtime measurements.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..');

const ignored = new Set(['node_modules', '.next', 'dist', 'coverage', 'e2e', '__tests__', 'scripts']);
const extensions = new Set(['.ts', '.tsx']);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (extensions.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const files = walk(frontendRoot);
const source = files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

const count = (pattern) => source.reduce((total, item) => total + (item.text.match(pattern) ?? []).length, 0);
const filesMatching = (pattern) => source.filter(({ text }) => pattern.test(text)).map(({ file }) => path.relative(frontendRoot, file));

const metrics = {
  useOnlineStatusFiles: filesMatching(/useOnlineStatus/).length,
  useOnlineStatusCalls: count(/useOnlineStatus\s*\(/g),
  rawOnlineOfflineListeners: count(/addEventListener\(\s*['"](?:online|offline)['"]/g),
  cardOfflineBadgeFiles: filesMatching(/CardOfflineBadge/).length,
  useNowAfterMountFiles: filesMatching(/useNowAfterMount/).length,
  reactMemoOccurrences: count(/(?:React\.)?memo\s*\(/g),
};

console.log('Render architecture baseline');
console.log('============================');
for (const [key, value] of Object.entries(metrics)) console.log(`${key}: ${value}`);
console.log('\nNotes:');
console.log('- These are static source metrics, not runtime render counts.');
console.log('- Runtime render counts should be measured with React DevTools Profiler on representative flows.');
console.log('- The phase-2 target is one underlying online/offline browser listener pair for useOnlineStatus consumers.');

console.log('\nOnline/offline listener files:');
for (const file of filesMatching(/addEventListener\(\s*['"](?:online|offline)['"]/)) console.log(`- ${file}`);
