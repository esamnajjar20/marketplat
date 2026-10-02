/**
 * Source-level guard (sw.js is a classic script — see swCachePolicy.test.ts).
 * NOTIF-SW-UX-01: Arabic-first banner (dir/lang), type-specific actions,
 * https-only images.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

const sw = readFileSync(path.resolve(__dirname, '../../../public/sw.js'), 'utf-8');
const start = sw.indexOf('function pushActionsFor');
const end = sw.indexOf("self.addEventListener('push'");

function loadActionsFn(): (d: Record<string, unknown>) => { action: string; title: string }[] {
  const ctx: Record<string, unknown> = {};
  vm.createContext(ctx);
  vm.runInContext(sw.slice(start, end), ctx);
  return ctx.pushActionsFor as never;
}

describe('sw.js push presentation', () => {
  const pushHandler = sw.slice(end, sw.indexOf("self.addEventListener('notificationclick'"));

  it('renders RTL Arabic', () => {
    expect(pushHandler).toMatch(/dir: 'rtl'/);
    expect(pushHandler).toMatch(/lang: 'ar'/);
  });

  it('accepts only https images', () => {
    expect(pushHandler).toMatch(/startsWith\('https:\/\/'\)/);
    expect(pushHandler).not.toMatch(/startsWith\('http'\)/);
  });

  it('chat pushes get a "reply" action, inferred from the tag when type is absent', () => {
    const fn = loadActionsFn();
    expect(fn({ tag: 'conversation-abc' })[0]).toEqual({ action: 'open', title: 'رد' });
    expect(fn({ type: 'NEW_MESSAGE' })[0].title).toBe('رد');
  });

  it('every variant keeps a dismiss action; the test push has only dismiss', () => {
    const fn = loadActionsFn();
    for (const d of [{}, { type: 'FAV_AD_SOLD' }, { type: 'NEW_REQUEST_OFFER' }, { tag: 'conversation-x' }]) {
      expect(fn(d).some((a) => a.action === 'dismiss')).toBe(true);
    }
    expect(fn({ type: 'TEST' })).toEqual([{ action: 'dismiss', title: 'تجاهل' }]);
  });
});
