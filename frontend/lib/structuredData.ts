/**
 * lib/structuredData.ts
 *
 * Schema.org JSON-LD builders. Consumed by server components
 * (RSC pages) that render a `<script type="application/ld+json">` tag
 * with the return value.
 *
 * Why JSON-LD at all: buildMetadata (lib/seo.ts) already produces
 * Open Graph + Twitter Card + canonical for social previews — the
 * human-facing half of SEO. What it cannot produce is machine-typed
 * data that Google Search parses as structured facts: this ad is a
 * Product, this price is an Offer, this store is a LocalBusiness.
 * Without that, the ad detail pages compete for generic snippets
 * instead of Rich Results (price/availability/rating badges).
 *
 * Safety: every builder returns a plain object; the caller serialises
 * via safeJsonLd() which escapes `<`, `>`, and `&` before injecting
 * into a <script> tag. This prevents a `</script>` inside a title or
 * description (user-controlled on ads) from breaking out of the JSON-LD
 * block and injecting arbitrary HTML. JSON.stringify alone does NOT
 * escape `<`, so the escaping is not optional.
 */
import { APP_URL, APP_NAME } from './constants';
import type { Ad } from '@/types/ad.types';

/**
 * Serialise a JSON-LD object to a string safe for embedding inside
 * `<script type="application/ld+json">{string}</script>`.
 *
 * The HTML parser terminates a script block at the first literal
 * `</script>`, regardless of JS string context. JSON.stringify does not
 * escape `<`, so `{"title":"</script>"}` would still break out. The
 * three replacements below turn every `<`/`>`/`&` into its `\u00XX`
 * form — valid JSON, invalid HTML-terminator, indistinguishable to any
 * JSON parser.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// ── Site-wide entities ───────────────────────────────────────────

/**
 * Organization — identifies the publisher of the site. Google uses
 * this to associate the Knowledge Graph entry with the domain.
 * Rendered once in app/layout.tsx.
 */
export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    alternateName: 'سوق غزة',
    url: APP_URL,
    logo: `${APP_URL}/icon-512`,
    areaServed: {
      '@type': 'Place',
      name: 'Gaza Strip',
      addressCountry: 'PS',
    },
  };
}

/**
 * WebSite — enables Google's sitelinks searchbox (a search input in
 * the SERP that deep-links into the site's own /search). Rendered once
 * in app/layout.tsx alongside Organization.
 */
export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    alternateName: 'سوق غزة',
    url: APP_URL,
    inLanguage: 'ar',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${APP_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

// ── Per-entity builders ──────────────────────────────────────────

function absoluteImageUrl(src: string): string {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return `${APP_URL}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** AdCondition enum → schema.org itemCondition URL. */
function conditionToSchema(condition: string | null): string | undefined {
  if (!condition) return undefined;
  switch (condition) {
    case 'NEW':
      return 'https://schema.org/NewCondition';
    case 'USED':
      return 'https://schema.org/UsedCondition';
    case 'REFURBISHED':
      return 'https://schema.org/RefurbishedCondition';
    default:
      return undefined;
  }
}

/** AdStatus enum → schema.org availability URL. */
function availabilityToSchema(status: string): string {
  return status === 'ACTIVE'
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
}

/**
 * Ad detail — combines Product + Offer (Product alone cannot carry a
 * price). Rendered in app/(public)/ads/[id]/page.tsx.
 *
 * Deliberately omitted when the ad has no price: an Offer without a
 * price triggers "missing required field" warnings in Google's Rich
 * Results tester, and a Product with no Offer is a stronger signal
 * than a broken Offer. Same for the aggregateRating — only included
 * when totalRatings > 0.
 */
export function buildAdJsonLd(ad: Ad) {
  const url = `${APP_URL}/ads/${ad.id}`;
  const price = ad.price !== null && ad.price !== '' ? parseFloat(ad.price) : NaN;
  const validPrice = Number.isFinite(price) && price >= 0;

  const product: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: ad.title,
    description: ad.description.slice(0, 500),
    ...(ad.images.length > 0 && {
      image: ad.images.slice(0, 5).map(absoluteImageUrl),
    }),
    ...(ad.category?.nameAr && { category: ad.category.nameAr }),
    ...(conditionToSchema(ad.condition) && {
      itemCondition: conditionToSchema(ad.condition),
    }),
  };

  if (validPrice) {
    product.offers = {
      '@type': 'Offer',
      '@id': `${url}#offer`,
      url,
      priceCurrency: 'ILS',
      price: price.toFixed(2),
      availability: availabilityToSchema(ad.status),
      ...(ad.city && {
        availableAtOrFrom: {
          '@type': 'Place',
          name: ad.city,
        },
      }),
      ...(ad.updatedAt && { priceValidUntil: ad.updatedAt.slice(0, 10) }),
    };
  }

  if (ad.sellerProfile && ad.sellerProfile.totalRatings > 0) {
    const ratingValue = parseFloat(ad.sellerProfile.averageRating);
    if (Number.isFinite(ratingValue) && ratingValue > 0) {
      product.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: ratingValue.toFixed(1),
        reviewCount: ad.sellerProfile.totalRatings,
        bestRating: 5,
        worstRating: 1,
      };
    }
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [product],
  };
}
