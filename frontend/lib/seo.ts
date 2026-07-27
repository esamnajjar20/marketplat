/**
 * SEO helpers — generate consistent Metadata objects for Next.js pages.
 *
 * Usage:
 *   export const metadata = buildMetadata({ title: 'My Page' });
 *   export const metadata = buildAdMetadata(ad);
 */
import type { Metadata } from 'next';
import { APP_NAME, APP_URL } from './constants';

interface BaseMetadataOptions {
  title: string;
  description?: string;
  path?: string;
  noIndex?: boolean;
  image?: string;
}

/** Generic metadata builder used across non-entity pages. */
export function buildMetadata({
  title,
  description,
  path = '',
  noIndex = false,
  image,
}: BaseMetadataOptions): Metadata {
  const url = `${APP_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title:       `${title} | ${APP_NAME}`,
      description,
      url,
      siteName:    APP_NAME,
      type:        'website',
      ...(image && { images: [{ url: image }] }),
    },
    twitter: {
      card:        'summary_large_image',
      title:       `${title} | ${APP_NAME}`,
      description,
      ...(image && { images: [image] }),
    },
  };
}

/** Build rich OG metadata for an ad detail page. */
export function buildAdMetadata(ad: {
  id: string;
  title: string;
  description: string;
  images: string[];
  price: string | null;
  city: string;
}): Metadata {
  return buildMetadata({
    title:       ad.title,
    description: ad.description.slice(0, 160),
    path:        `/ads/${ad.id}`,
    image:       ad.images[0],
  });
}

/** Metadata for category pages. */
export function buildCategoryMetadata(category: {
  slug: string;
  name: string;
}): Metadata {
  return buildMetadata({
    title:       `${category.name} — ${APP_NAME}`,
    description: `Browse the best ${category.name} listings on ${APP_NAME}.`,
    path:        `/categories/${category.slug}`,
  });
}
