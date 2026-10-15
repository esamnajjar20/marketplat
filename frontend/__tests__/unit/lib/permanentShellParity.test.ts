/**
 * public/sw.js is a classic script and cannot import the TypeScript lists, so
 * the permanent-shell allowlists are duplicated there. This test fails if the
 * two copies drift (a path pinned in one place but trimmed by the other).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERMANENT_PUBLIC_SHELL_ROUTES,
  PERMANENT_PERSONAL_SHELL_ROUTES,
} from '@/lib/offlineRouteShells';

const sw = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

function swSet(name: string): string[] {
  const match = sw.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) throw new Error(`${name} not found in public/sw.js`);
  return Array.from(match[1]!.matchAll(/'([^']+)'/g)).map((m) => m[1]!);
}

describe('permanent shell allowlist parity (lib ↔ sw.js)', () => {
  it('public lists match', () => {
    expect([...swSet('PERMANENT_PUBLIC_SHELL_PATHS')].sort()).toEqual([...PERMANENT_PUBLIC_SHELL_ROUTES].sort());
  });
  it('personal lists match', () => {
    expect([...swSet('PERMANENT_PERSONAL_SHELL_PATHS')].sort()).toEqual([...PERMANENT_PERSONAL_SHELL_ROUTES].sort());
  });
});
