import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/constants';

/**
 * robots.txt — /robots.txt
 *
 * Rules:
 *  - Allow all crawlers on public content (home, ads, categories, profiles).
 *  - Disallow authenticated areas (dashboard, settings, admin, my-ads, favorites, messages).
 *  - Disallow search result pages (avoid duplicate content penalties).
 *  - Disallow API routes.
 *  - Point to sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/ads/',
          '/categories/',
          '/profile/',
        ],
        disallow: [
          '/dashboard',
          '/my-ads',
          '/favorites',
          '/messages',
          '/settings',
          '/admin',
          '/search',     // search result pages — not canonical content
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
        ],
      },
      // Block AI training crawlers explicitly
      {
        userAgent: ['GPTBot', 'CCBot', 'Google-Extended', 'anthropic-ai'],
        disallow: ['/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host:    APP_URL,
  };
}
