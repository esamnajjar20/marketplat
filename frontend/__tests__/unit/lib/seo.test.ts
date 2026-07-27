/**
 * __tests__/unit/lib/seo.test.ts
 *
 * Coverage for lib/seo.ts — the Metadata builders used across every
 * page.tsx in the app. Pinning these down protects against silent SEO
 * regressions (wrong canonical URL, noIndex flipped, OG image missing)
 * that a type checker can't catch since Metadata's shape is satisfied
 * either way.
 */
import { describe, it, expect } from 'vitest';
import { buildMetadata, buildAdMetadata, buildCategoryMetadata } from '@/lib/seo';
import { APP_NAME, APP_URL } from '@/lib/constants';

describe('buildMetadata', () => {
  it('builds a canonical URL from APP_URL + path', () => {
    const metadata = buildMetadata({ title: 'صفحة البحث', path: '/search' });
    expect(metadata.alternates?.canonical).toBe(`${APP_URL}/search`);
  });

  it('defaults to indexable (index: true, follow: true) when noIndex is not set', () => {
    const metadata = buildMetadata({ title: 'الرئيسية' });
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it('sets index: false, follow: false when noIndex is true', () => {
    const metadata = buildMetadata({ title: 'تسجيل الدخول', noIndex: true });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('appends the app name to the OpenGraph and Twitter titles', () => {
    const metadata = buildMetadata({ title: 'عنوان الصفحة' });
    expect(metadata.openGraph?.title).toBe(`عنوان الصفحة | ${APP_NAME}`);
    expect(metadata.twitter?.title).toBe(`عنوان الصفحة | ${APP_NAME}`);
  });

  it('omits openGraph/twitter images when no image is given', () => {
    const metadata = buildMetadata({ title: 'بدون صورة' });
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter?.images).toBeUndefined();
  });

  it('includes the image in both openGraph and twitter when given', () => {
    const metadata = buildMetadata({ title: 'مع صورة', image: 'https://cdn.example.com/a.jpg' });
    expect(metadata.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/a.jpg' }]);
    expect(metadata.twitter?.images).toEqual(['https://cdn.example.com/a.jpg']);
  });
});

describe('buildAdMetadata', () => {
  const baseAd = {
    id: 'ad-1',
    title: 'آيفون 14 برو للبيع',
    description: 'جهاز بحالة ممتازة، استخدام خفيف، مع جميع الملحقات الأصلية والعلبة وشاحن أصلي وكفالة سارية',
    images: ['https://cdn.example.com/iphone.jpg'],
    price: 3500,
    city: 'الرياض',
  };

  it('builds the canonical path under /ads/:id', () => {
    const metadata = buildAdMetadata(baseAd);
    expect(metadata.alternates?.canonical).toBe(`${APP_URL}/ads/ad-1`);
  });

  it('truncates the description to 160 characters', () => {
    const metadata = buildAdMetadata(baseAd);
    expect((metadata.description as string).length).toBeLessThanOrEqual(160);
    expect(metadata.description).toBe(baseAd.description.slice(0, 160));
  });

  it('uses the first image as the OG/Twitter image', () => {
    const metadata = buildAdMetadata(baseAd);
    expect(metadata.openGraph?.images).toEqual([{ url: baseAd.images[0] }]);
  });

  it('does not throw and omits the image when the ad has no images', () => {
    const adWithoutImages = { ...baseAd, images: [] };
    expect(() => buildAdMetadata(adWithoutImages)).not.toThrow();
    const metadata = buildAdMetadata(adWithoutImages);
    expect(metadata.openGraph?.images).toBeUndefined();
  });

  it('is indexable by default (ad pages should be crawled)', () => {
    const metadata = buildAdMetadata(baseAd);
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});

describe('buildCategoryMetadata', () => {
  it('builds the canonical path under /categories/:slug', () => {
    const metadata = buildCategoryMetadata({ slug: 'electronics', name: 'إلكترونيات' });
    expect(metadata.alternates?.canonical).toBe(`${APP_URL}/categories/electronics`);
  });

  it('includes the category name in the title', () => {
    const metadata = buildCategoryMetadata({ slug: 'cars', name: 'سيارات' });
    expect(metadata.title).toContain('سيارات');
  });
});
