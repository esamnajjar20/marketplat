#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensions = new Set(['.ts', '.tsx']);
const ignoredDirs = new Set(['android', 'node_modules', '.expo', 'assets', 'scripts']);
const files: string[] = [];

async function walk(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name) && !entry.name.startsWith('.')) {
        await walk(join(dir, entry.name));
      }
    } else if (extensions.has(extname(entry.name))) {
      files.push(join(dir, entry.name));
    }
  }
}

await walk(root);

const problems: string[] = [];
const rawHex = /#[0-9a-fA-F]{3,8}\b/g;
const anyPattern = /:\s*any\b|\bas\s+any\b|<any>/g;

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const relativePath = relative(root, file);
  const lines = source.split('\n');

  // Theme tokens themselves are the only place where raw colors are expected.
  if (!relativePath.endsWith('src/theme/tokens.ts')) {
    for (const match of source.matchAll(rawHex)) {
      const line = source.slice(0, match.index ?? 0).split('\n').length;
      problems.push(`${relativePath}:${line}: raw hex color; use @/theme/tokens`);
    }
  }

  // Catch obvious accidental explicit-any declarations without banning the word in comments/text.
  for (const match of source.matchAll(anyPattern)) {
    const line = source.slice(0, match.index ?? 0).split('\n').length;
    const lineText = lines[line - 1] ?? '';
    if (!relativePath.includes('/__tests__/') && !/eslint-disable|intentional-any:/i.test(lineText)) {
      problems.push(
        `${relativePath}:${line}: explicit any; add a typed value or documented intentional-any marker`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`Mobile lint failed (${problems.length} issue(s))\n${problems.join('\n')}`);
  process.exit(1);
}

console.log(`Mobile lint passed (${files.length} TypeScript source files checked).`);
