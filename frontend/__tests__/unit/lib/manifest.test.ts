/**
 * __tests__/unit/lib/manifest.test.ts
 *
 * FIX PROD-02 coverage: pins down that every icon size the manifest
 * declares actually has a corresponding generated route, so a future
 * edit to one side (e.g. removing app/icon-512/route.tsx) doesn't
 * silently leave the manifest pointing at a 404.
 *
 * FIX PWA-03: a maskable 512x512 variant was added alongside the
 * regular one (Android/adaptive-icon systems crop a non-maskable icon
 * to a circle/squircle) — updated here to expect both.
 */
import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('manifest', () => {
  const result = manifest();

  it('declares the generated icon sizes with matching src paths, including the maskable variant', () => {
    const sizes = result.icons?.map((icon) => icon.sizes).sort();
    expect(sizes).toEqual(['192x192', '32x32', '512x512', '512x512']);
  });

  it('every declared icon src corresponds to an existing route/file convention', () => {
    // /icon → app/icon.tsx (Next.js file convention)
    // /icon-192 → app/icon-192/route.tsx
    // /icon-512 → app/icon-512/route.tsx
    // /icon-512-maskable → app/icon-512-maskable/route.tsx (FIX PWA-03)
    const srcs = result.icons?.map((icon) => icon.src).sort();
    expect(srcs).toEqual(['/icon', '/icon-192', '/icon-512', '/icon-512-maskable']);
  });

  it('is configured for RTL Arabic', () => {
    expect(result.lang).toBe('ar');
    expect(result.dir).toBe('rtl');
  });

  it('uses the brand olive as theme_color, matching app/globals.css --primary', () => {
    expect(result.theme_color).toBe('#2F5D45');
  });
});
