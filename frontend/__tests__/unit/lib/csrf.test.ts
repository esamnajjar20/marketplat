/**
 * __tests__/unit/lib/csrf.test.ts
 *
 * Previously uncovered despite being the client half of the double-
 * submit CSRF check (see csrf.ts's header comment): client.ts echoes
 * this value back as X-CSRF-Token on every state-changing request, and
 * the backend rejects the request if it doesn't match the cookie. A
 * regression in the regex here (e.g. matching the wrong cookie, or
 * failing to decode) either breaks every authenticated write in
 * production or — worse — silently reads an empty/wrong token that
 * still happens to satisfy some lenient backend check.
 *
 * document.cookie is a getter in jsdom; can't be reassigned directly,
 * so it's stubbed via vi.stubGlobal on the whole `document` object per
 * test (spying on Object.defineProperty(document, 'cookie', ...) is the
 * usual alternative but stubbing is simpler here since we only read).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getCsrfToken } from '@/lib/csrf';

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    value,
    writable: true,
    configurable: true,
  });
}

describe('getCsrfToken', () => {
  afterEach(() => {
    setCookie('');
  });

  it('returns null when there is no csrfToken cookie at all', () => {
    setCookie('other=1; another=2');
    expect(getCsrfToken()).toBeNull();
  });

  it('returns null when the cookie jar is empty', () => {
    setCookie('');
    expect(getCsrfToken()).toBeNull();
  });

  it('reads the token when csrfToken is the only cookie', () => {
    setCookie('csrfToken=abc123');
    expect(getCsrfToken()).toBe('abc123');
  });

  it('reads the token when it is the first of several cookies', () => {
    setCookie('csrfToken=abc123; sessionHint=xyz');
    expect(getCsrfToken()).toBe('abc123');
  });

  it('reads the token when it is the last of several cookies', () => {
    setCookie('sessionHint=xyz; csrfToken=abc123');
    expect(getCsrfToken()).toBe('abc123');
  });

  it('reads the token when it is in the middle of several cookies', () => {
    setCookie('a=1; csrfToken=abc123; b=2');
    expect(getCsrfToken()).toBe('abc123');
  });

  it('does not match a cookie whose name merely ends with csrfToken', () => {
    // e.g. "otherCsrfToken=evil" must not be picked up as csrfToken
    setCookie('otherCsrfToken=evil-value');
    expect(getCsrfToken()).toBeNull();
  });

  it('URL-decodes the token value', () => {
    setCookie('csrfToken=' + encodeURIComponent('abc/123+def=='));
    expect(getCsrfToken()).toBe('abc/123+def==');
  });

  it('returns an empty string (not null) for an explicitly empty token value', () => {
    setCookie('csrfToken=');
    expect(getCsrfToken()).toBe('');
  });

  it('returns null when document is undefined (SSR)', () => {
    const original = globalThis.document;
    // @ts-expect-error simulating SSR where document does not exist
    delete globalThis.document;

    expect(getCsrfToken()).toBeNull();

    globalThis.document = original;
  });
});
