import '@testing-library/jest-dom';
import React from 'react';
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// ── Next.js mocks ──────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter:    () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname:  () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  redirect:     vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
  headers: () => new Headers(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // Next's Image accepts a `fill` boolean prop that isn't a valid <img>
    // attribute, and `priority`/`sizes` aren't meaningful in jsdom either —
    // strip the Next-specific props so React doesn't warn about unknown
    // DOM attributes, while keeping everything else (src, alt, className...).
    // Uses createElement (not JSX) since this file has a .ts extension.
    const { fill, priority, sizes, ...imgProps } = props;
    return React.createElement('img', imgProps);
  },
}));

// ── File preview APIs — jsdom doesn't implement these natively ─────
let objectUrlCounter = 0;
const objectUrls = new Set<string>();

vi.stubGlobal('URL', class extends URL {
  static createObjectURL(_blob: Blob): string {
    const url = `blob:mock-url-${objectUrlCounter++}`;
    objectUrls.add(url);
    return url;
  }
  static revokeObjectURL(url: string): void {
    objectUrls.delete(url);
  }
});

// ── MSW — start service worker in Node (for API-layer tests) ───────
// Import lazily to avoid crashing environments where msw is unused.
// FIX TEST-V4-08: previously `server` was a private local variable with
// no way for any test file to register its own handlers via
// `server.use(...)` — the MSW scaffolding existed but nothing could
// actually use it. Exported via getMswServer() so test files can do:
//   import { getMswServer } from '../../vitest.setup';
//   getMswServer()?.use(http.post(url, () => HttpResponse.json(...)));
let server: import('msw/node').SetupServer | undefined;

export function getMswServer() {
  return server;
}

beforeAll(async () => {
  try {
    const { setupServer } = await import('msw/node');
    server = setupServer();
    server.listen({ onUnhandledRequest: 'bypass' });
  } catch {
    // msw not installed yet — non-fatal for pure unit tests
  }
});

afterEach(() => {
  server?.resetHandlers();
});

afterAll(() => {
  server?.close();
});

// ── Suppress noisy console in test output ─────────────────────────
const noop = () => {};
vi.spyOn(console, 'error').mockImplementation(noop);
vi.spyOn(console, 'warn').mockImplementation(noop);
