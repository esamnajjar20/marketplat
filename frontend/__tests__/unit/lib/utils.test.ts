/**
 * __tests__/unit/lib/utils.test.ts
 *
 * Coverage targets for lib/utils.ts:
 *  - cn(): merges classes, handles conflicts, handles conditionals
 *  - sleep(): resolves after given ms
 *  - typedKeys(): returns typed keys
 *  - clamp(): boundary cases
 *  - isServer: false in jsdom
 *
 * Coverage targets for lib/seo.ts:
 *  - buildMetadata(): title, description, canonical, og, twitter, noIndex
 *  - buildAdMetadata(): truncates description, sets path, image
 *  - buildCategoryMetadata(): category name/slug
 */
import { describe, it, expect, vi } from 'vitest';
import { cn, sleep, typedKeys, clamp, isServer } from '@/lib/utils';
import { buildMetadata, buildAdMetadata, buildCategoryMetadata } from '@/lib/seo';

// ── cn() ──────────────────────────────────────────────────────────

describe('cn()', () => {
  it('merges two class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes (false omitted)', () => {
    expect(cn('base', false && 'hidden')).toBe('base');
  });

  it('handles conditional classes (true included)', () => {
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('resolves Tailwind conflicts (later wins)', () => {
    // twMerge: p-4 overrides p-2
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
    expect(result).not.toContain('p-2');
  });

  it('handles undefined/null gracefully', () => {
    expect(() => cn('a', undefined, null as never, 'b')).not.toThrow();
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });

  it('handles object syntax { class: condition }', () => {
    const result = cn({ 'text-red-500': true, 'text-blue-500': false });
    expect(result).toContain('text-red-500');
    expect(result).not.toContain('text-blue-500');
  });

  it('handles array syntax', () => {
    expect(cn(['a', 'b'])).toBe('a b');
  });

  it('deduplicates same class', () => {
    const result = cn('flex', 'flex');
    // twMerge deduplicates
    expect(result.split(' ').length).toBe(1);
  });
});

// ── sleep() ───────────────────────────────────────────────────────

describe('sleep()', () => {
  it('resolves after approximately the given ms', async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('does not resolve before the given ms', async () => {
    vi.useFakeTimers();
    let resolved = false;
    sleep(200).then(() => { resolved = true; });
    vi.advanceTimersByTime(100);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });

  it('resolves with undefined (no value)', async () => {
    vi.useFakeTimers();
    const promise = sleep(0);
    vi.advanceTimersByTime(0);
    const result = await promise;
    expect(result).toBeUndefined();
    vi.useRealTimers();
  });
});

// ── typedKeys() ───────────────────────────────────────────────────

describe('typedKeys()', () => {
  it('returns the object keys as an array', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(typedKeys(obj)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for empty object', () => {
    expect(typedKeys({})).toEqual([]);
  });

  it('preserves key type (keyof T)', () => {
    const obj = { x: 'hello', y: 42 };
    const keys = typedKeys(obj);
    // TypeScript would enforce (keyof typeof obj)[], runtime: just strings
    expect(keys).toContain('x');
    expect(keys).toContain('y');
  });
});

// ── clamp() ───────────────────────────────────────────────────────

describe('clamp()', () => {
  it('returns value when within [min, max]', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('returns min when value < min', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('returns max when value > max', () => {
    expect(clamp(200, 0, 100)).toBe(100);
  });

  it('returns min when value === min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value === max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('handles negative range', () => {
    expect(clamp(-15, -20, -10)).toBe(-15);
    expect(clamp(-25, -20, -10)).toBe(-20);
    expect(clamp(-5,  -20, -10)).toBe(-10);
  });

  it('handles same min and max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(0, 3, 3)).toBe(3);
  });
});

// ── isServer ──────────────────────────────────────────────────────

describe('isServer', () => {
  it('is false in jsdom (browser-like) environment', () => {
    expect(isServer).toBe(false);
  });
});

// ── buildMetadata() ───────────────────────────────────────────────

describe('buildMetadata()', () => {
  it('sets the title', () => {
    const meta = buildMetadata({ title: 'الرئيسية' });
    expect(meta.title).toBe('الرئيسية');
  });

  it('sets description', () => {
    const meta = buildMetadata({ title: 'x', description: 'وصف الصفحة' });
    expect(meta.description).toBe('وصف الصفحة');
  });

  it('sets canonical URL with APP_URL + path', () => {
    const meta = buildMetadata({ title: 'x', path: '/search' });
    expect((meta.alternates?.canonical as string)).toContain('/search');
  });

  it('sets robots index:true by default', () => {
    const meta = buildMetadata({ title: 'x' });
    expect((meta.robots as { index: boolean }).index).toBe(true);
  });

  it('sets robots index:false when noIndex=true', () => {
    const meta = buildMetadata({ title: 'x', noIndex: true });
    expect((meta.robots as { index: boolean }).index).toBe(false);
  });

  it('sets openGraph title with APP_NAME suffix', () => {
    const meta = buildMetadata({ title: 'الإعلانات' });
    const ogTitle = (meta.openGraph as { title: string }).title;
    expect(ogTitle).toContain('الإعلانات');
    expect(ogTitle).toContain('سوق غزة');
  });

  it('sets openGraph image when provided', () => {
    const meta = buildMetadata({ title: 'x', image: 'https://res.cloudinary.com/img.jpg' });
    const ogImages = (meta.openGraph as { images?: { url: string }[] }).images;
    expect(ogImages?.[0]?.url).toBe('https://res.cloudinary.com/img.jpg');
  });

  it('omits openGraph images when no image provided', () => {
    const meta = buildMetadata({ title: 'x' });
    const ogImages = (meta.openGraph as { images?: unknown[] }).images;
    expect(ogImages).toBeUndefined();
  });

  it('sets twitter card type', () => {
    const meta = buildMetadata({ title: 'x' });
    expect((meta.twitter as { card: string }).card).toBe('summary_large_image');
  });
});

// ── buildAdMetadata() ─────────────────────────────────────────────

describe('buildAdMetadata()', () => {
  const baseAd = {
    id:          'ad-123',
    title:       'سيارة تويوتا 2020',
    description: 'وصف طويل '.repeat(30), // >160 chars
    images:      ['https://res.cloudinary.com/demo/image/upload/car.jpg'],
    price:       null,
    city:        'غزة',
  };

  it('uses ad title', () => {
    const meta = buildAdMetadata(baseAd);
    expect(meta.title).toBe('سيارة تويوتا 2020');
  });

  it('truncates description to 160 chars', () => {
    const meta = buildAdMetadata(baseAd);
    expect((meta.description?.length ?? 0)).toBeLessThanOrEqual(160);
  });

  it('sets path to /ads/:id', () => {
    const meta = buildAdMetadata(baseAd);
    expect((meta.alternates?.canonical as string)).toContain('/ads/ad-123');
  });

  it('uses first image as OG image', () => {
    const meta = buildAdMetadata(baseAd);
    const ogImages = (meta.openGraph as { images?: { url: string }[] }).images;
    expect(ogImages?.[0]?.url).toBe('https://res.cloudinary.com/demo/image/upload/car.jpg');
  });

  it('handles empty images array (no image)', () => {
    const meta = buildAdMetadata({ ...baseAd, images: [] });
    // image is undefined → no OG image
    const ogImages = (meta.openGraph as { images?: unknown[] }).images;
    expect(ogImages).toBeUndefined();
  });
});

// ── buildCategoryMetadata() ───────────────────────────────────────

describe('buildCategoryMetadata()', () => {
  it('includes category name in title', () => {
    const meta = buildCategoryMetadata({ slug: 'electronics', name: 'الإلكترونيات' });
    expect((meta.title as string)).toContain('الإلكترونيات');
  });

  it('sets path to /categories/:slug', () => {
    const meta = buildCategoryMetadata({ slug: 'cars', name: 'السيارات' });
    expect((meta.alternates?.canonical as string)).toContain('/categories/cars');
  });

  it('sets a non-empty description', () => {
    const meta = buildCategoryMetadata({ slug: 'furniture', name: 'أثاث' });
    expect(meta.description?.length).toBeGreaterThan(0);
  });
});
