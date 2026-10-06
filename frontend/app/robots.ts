import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/constants';

/**
 * robots.txt — /robots.txt
 *
 * Rules:
 *  - Allow all crawlers on public content (home, ads, categories, profiles).
 *  - Disallow authenticated areas (dashboard, activity, my-*, settings, admin, favorites, messages...).
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
          // every authenticated / account route. /my-ads,
          // /my-requests and /my-reports are redirect-only 
          // (-> /activity?tab=...) but stay listed for old crawled URLs.
          '/dashboard',
          '/activity',
          '/ads/create',
          '/my-ads',
          '/my-requests',
          '/my-reports',
          '/my-store',
          '/my-services',
          '/favorites',
          '/messages',
          '/notifications',
          '/saved-searches',
          '/saved-payments',
          '/service-requests',
          '/requests/new',
          '/requests/me',
          '/requests/offers',
          '/complete-profile',
          '/offline',
          '/shared',
          '/update',
          '/settings',
          '/admin',
          '/search',     // search result pages — not canonical content
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
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
