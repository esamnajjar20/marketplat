#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensions = new Set(['.ts', '.tsx']);
const ignoredDirs = new Set(['android', 'node_modules', '.expo', 'assets', 'scripts']);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) await walk(join(dir, entry.name)); }
    else if (extensions.has(extname(entry.name))) files.push(join(dir, entry.name));
  }
}
await walk(root);
const problems = [];
const rawHex = /#[0-9a-fA-F]{3,8}\b/g;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  // Theme tokens themselves are the only place where raw colors are expected.
  if (!file.endsWith('/src/theme/tokens.ts')) {
    for (const match of text.matchAll(rawHex)) {
      const line = text.slice(0, match.index).split('\n').length;
      problems.push(`${relative(root, file)}:${line}: raw hex color; use @/theme/tokens`);
    }
  }
  // Catch obvious accidental explicit-any declarations without banning the word in comments/text.
  const anyPattern = /:\s*any\b|\bas\s+any\b|<any>/g;
  for (const match of text.matchAll(anyPattern)) {
    const line = text.slice(0, match.index).split('\n').length;
    const lineText = text.split('\n')[line - 1] ?? '';
    if (!file.includes('/__tests__/') && !/eslint-disable|intentional-any:/i.test(lineText)) problems.push(`${relative(root, file)}:${line}: explicit any; add a typed value or documented intentional-any marker`);
  }
}
if (problems.length) { console.error(`Mobile lint failed (${problems.length} issue(s))\n${problems.join('\n')}`); process.exit(1); }
console.log(`Mobile lint passed (${files.length} TypeScript source files checked).`);
