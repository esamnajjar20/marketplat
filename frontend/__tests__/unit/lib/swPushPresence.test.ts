/**
 * Source-level guard (sw.js is a classic script — see swCachePolicy.test.ts).
 * PUSH-PRESENCE-01: chat pushes are suppressed only when a window is
 * visible AND focused on the exact target path; everything else must
 * still reach showNotification.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const sw = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');
const start = sw.indexOf("self.addEventListener('push'");
const end = sw.indexOf("self.addEventListener('notificationclick'");
const pushHandler = sw.slice(start, end);

describe('sw.js push handler presence suppression', () => {
  it('locates the push handler', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('only considers chat pushes (conversation-* tag)', () => {
    expect(pushHandler).toMatch(/data\.tag\.startsWith\('conversation-'\)/);
  });

  it('requires visible AND focused AND exact pathname match', () => {
    expect(pushHandler).toMatch(/visibilityState === 'visible'/);
    expect(pushHandler).toMatch(/c\.focused === true/);
    expect(pushHandler).toMatch(/new URL\(c\.url\)\.pathname === targetPath/);
  });

  it('falls through to showNotification if the presence check throws', () => {
    expect(pushHandler).toMatch(/presence check failed — fall through/);
    expect(pushHandler).toMatch(/await self\.registration\.showNotification\(title, options\)/);
  });
});
