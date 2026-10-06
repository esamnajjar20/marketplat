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
import { APP_URL, APP_NAME, CITIES } from './constants';
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


// ── Product / Store / Service (added alongside the Ad builder) ───

function productAvailabilityToSchema(a: string): string {
  switch (a) {
    case 'IN_STOCK':
    case 'LIMITED':
      return 'https://schema.org/InStock';
    case 'OUT_OF_STOCK':
      return 'https://schema.org/OutOfStock';
    default:
      return 'https://schema.org/InStock';
  }
}

/**
 * Product detail — Product + Offer. Same conditional rules as
 * buildAdJsonLd: no Offer without a valid price, no aggregateRating
 * without a real rating count. `brand` is only set when a store name
 * was provided by the caller; the API for product detail does not
 * always join the store, and a missing brand is preferable to a wrong
 * one.
 */
export function buildProductJsonLd(product: {
  id: string;
  name: string;
  description?: string;
  images?: string[];
  price: string | number | null | undefined;
  discountPrice?: string | number | null;
  availability?: string;
  updatedAt?: string;
  categoryName?: string;
  storeName?: string;
}) {
  const url = `${APP_URL}/products/${product.id}`;
  const rawPrice = product.discountPrice ?? product.price;
  const price = rawPrice !== null && rawPrice !== undefined && rawPrice !== ''
    ? parseFloat(String(rawPrice))
    : NaN;
  const validPrice = Number.isFinite(price) && price >= 0;

  const node: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    ...(product.description && { description: product.description.slice(0, 500) }),
    ...(product.images && product.images.length > 0 && {
      image: product.images.slice(0, 5).map(absoluteImageUrl),
    }),
    ...(product.categoryName && { category: product.categoryName }),
    ...(product.storeName && { brand: { '@type': 'Brand', name: product.storeName } }),
  };

  if (validPrice) {
    node.offers = {
      '@type': 'Offer',
      '@id': `${url}#offer`,
      url,
      priceCurrency: 'ILS',
      price: price.toFixed(2),
      availability: productAvailabilityToSchema(product.availability ?? 'IN_STOCK'),
      ...(product.updatedAt && { priceValidUntil: product.updatedAt.slice(0, 10) }),
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [node],
  };
}

/**
 * Store detail — LocalBusiness (Google's alias for a physical retail
 * outlet; more specific than Organization). StoreDetails carries the
 * fields needed: name, description, logo, cover image, phone, city,
 * optional lat/lng. aggregateRating is only emitted when the store
 * payload happens to include seller rating fields — the store detail
 * API joins sellerProfile, but older snapshots may not.
 */
export function buildStoreJsonLd(store: {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  phone?: string;
  city?: string;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  averageRating?: string | null;
  totalRatings?: number | null;
}) {
  const url = `${APP_URL}/stores/${store.slug || store.id}`;
  const lat = store.latitude != null ? Number(store.latitude) : NaN;
  const lng = store.longitude != null ? Number(store.longitude) : NaN;
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);

  const node: Record<string, unknown> = {
    '@type': 'Store',
    '@id': `${url}#store`,
    name: store.name,
    url,
    ...(store.description && { description: store.description.slice(0, 500) }),
    ...(store.logoUrl && { logo: absoluteImageUrl(store.logoUrl) }),
    ...(store.coverImageUrl && { image: absoluteImageUrl(store.coverImageUrl) }),
    ...(store.phone && { telephone: store.phone }),
    ...(store.city && {
      address: {
        '@type': 'PostalAddress',
        addressLocality: store.city,
        ...(store.address && { streetAddress: store.address }),
        addressCountry: 'PS',
      },
    }),
    ...(hasGeo && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: lat,
        longitude: lng,
      },
    }),
  };

  const rating = store.averageRating != null ? parseFloat(String(store.averageRating)) : NaN;
  const count = Number(store.totalRatings ?? 0);
  if (Number.isFinite(rating) && rating > 0 && count > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount: count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [node],
  };
}

/**
 * Service listing detail — Service + optional Offer. The provider is
 * rendered as a Person with a profile URL back into /profile/[userId];
 * a full LocalBusiness would require the provider's business address,
 * which is not on the service-listing payload, and a Person is what
 * the marketplace actually represents here (the person offering the
 * service). NEGOTIABLE listings emit no Offer — there is no price to
 * quote.
 */
export function buildServiceJsonLd(listing: {
  id: string;
  title: string;
  description?: string;
  images?: string[];
  price?: string | number | null;
  pricingType?: string;
  categoryName?: string;
  updatedAt?: string;
  provider?: {
    displayName?: string | null;
    userId?: string;
    businessName?: string;
  } | null;
}) {
  const url = `${APP_URL}/services/${listing.id}`;
  const rawPrice = listing.price;
  const price = rawPrice !== null && rawPrice !== undefined && rawPrice !== ''
    ? parseFloat(String(rawPrice))
    : NaN;
  const validPrice = Number.isFinite(price) && price >= 0;

  const providerName =
    listing.provider?.businessName ||
    listing.provider?.displayName ||
    undefined;

  const node: Record<string, unknown> = {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: listing.title,
    ...(listing.description && { description: listing.description.slice(0, 500) }),
    ...(listing.images && listing.images.length > 0 && {
      image: listing.images.slice(0, 5).map(absoluteImageUrl),
    }),
    ...(listing.categoryName && { serviceType: listing.categoryName }),
    ...(providerName && {
      provider: {
        '@type': 'Person',
        name: providerName,
        ...(listing.provider?.userId && {
          url: `${APP_URL}/profile/${listing.provider.userId}`,
        }),
      },
    }),
    areaServed: {
      '@type': 'Place',
      name: 'Gaza Strip',
      addressCountry: 'PS',
    },
  };

  if (validPrice && listing.pricingType !== 'NEGOTIABLE') {
    node.offers = {
      '@type': 'Offer',
      '@id': `${url}#offer`,
      url,
      priceCurrency: 'ILS',
      price: price.toFixed(2),
      ...(listing.updatedAt && { priceValidUntil: listing.updatedAt.slice(0, 10) }),
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [node],
  };
}


/**
 * SW-SEO-JSONLD-REQUEST-01: schema.org Demand — the closest semantic
 * fit for "someone is looking for X". Google parses Demand rarely
 * (unlike Product/Service), so this is a lower-yield addition than
 * the other builders — but it costs nothing at runtime, and having a
 * structured entity is strictly better than a bare page for any
 * future consumer that does read it (specialised aggregators, LLM
 * crawlers, etc.).
 *
 * Field mapping:
 *   title          → name
 *   description    → description
 *   city           → areaServed (Place)
 *   type           → category (REQUEST_TYPE_LABEL maps SERVICE |
 *                    PRODUCT | RENTAL to Arabic labels)
 *   budgetMin/Max  → priceSpecification (PriceSpecification with
 *                    minPrice / maxPrice). Omitted entirely when
 *                    both are null — most requests are posted without
 *                    a budget, and a zero range would be misleading.
 *   createdAt      → datePosted
 *   expiresAt      → validThrough (ISO 8601 date)
 *
 * Customer name is deliberately NOT included. The user's public
 * display name appears on the request detail page (as part of the
 * customer summary block), but embedding it in machine-readable
 * markup would create a scrapable association between the account
 * and every request they post — a weaker signal than the seller
 * profile, which the user explicitly opted into by becoming a
 * seller. Keeping the request anonymous in structured data is the
 * safer default; the page itself still shows the name to humans.
 */
export function buildRequestJsonLd(request: {
  id: string;
  title: string;
  description?: string;
  city?: string | null;
  type?: string;
  status?: string;
  budgetMin?: string | number | null;
  budgetMax?: string | number | null;
  createdAt?: string;
  expiresAt?: string | null;
}) {
  const url = `${APP_URL}/requests/${request.id}`;

  const min = request.budgetMin != null ? parseFloat(String(request.budgetMin)) : NaN;
  const max = request.budgetMax != null ? parseFloat(String(request.budgetMax)) : NaN;
  const hasMin = Number.isFinite(min) && min >= 0;
  const hasMax = Number.isFinite(max) && max >= 0;

  let priceSpecification: Record<string, unknown> | undefined;
  if (hasMin || hasMax) {
    priceSpecification = {
      '@type': 'PriceSpecification',
      priceCurrency: 'ILS',
      ...(hasMin && { minPrice: min.toFixed(2) }),
      ...(hasMax && { maxPrice: max.toFixed(2) }),
    };
  }

  const typeLabel =
    request.type === 'SERVICE'
      ? 'خدمة'
      : request.type === 'PRODUCT'
        ? 'منتج'
        : request.type === 'RENTAL'
          ? 'إيجار'
          : undefined;

  const node: Record<string, unknown> = {
    '@type': 'Demand',
    '@id': `${url}#demand`,
    name: request.title,
    url,
    ...(request.description && { description: request.description.slice(0, 500) }),
    ...(request.city && {
      areaServed: {
        '@type': 'Place',
        name: request.city,
        addressCountry: 'PS',
      },
    }),
    ...(typeLabel && { category: typeLabel }),
    ...(priceSpecification && { priceSpecification }),
    ...(request.createdAt && { datePosted: request.createdAt }),
    ...(request.expiresAt && { validThrough: request.expiresAt }),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [node],
  };
}

/**
 * Homepage JSON-LD — WebPage + ItemList of primary browse destinations
 * and Gaza cities for internal discovery signals.
 */
export function buildHomePageJsonLd() {
  const homeUrl = `${APP_URL}/`;
  const browse = [
    { name: 'الإعلانات', path: '/search?type=ads' },
    { name: 'المنتجات', path: '/products' },
    { name: 'الخدمات', path: '/services' },
    { name: 'المتاجر', path: '/stores' },
    { name: 'مقدمو الخدمات', path: '/service-providers' },
  ];
  const cities: readonly string[] = CITIES;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${homeUrl}#webpage`,
        url: homeUrl,
        name: `${APP_NAME} — سوق غزة المحلي`,
        description:
          'منصة إعلانات ومنتجات وخدمات ومتاجر في قطاع غزة — ابحث، اشترِ، أو اعرض مجاناً.',
        inLanguage: 'ar',
        isPartOf: { '@id': `${APP_URL}/#website` },
        about: {
          '@type': 'Place',
          name: 'Gaza Strip',
          addressCountry: 'PS',
        },
      },
      {
        '@type': 'ItemList',
        '@id': `${homeUrl}#browse`,
        name: 'أقسام السوق',
        numberOfItems: browse.length,
        itemListElement: browse.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          url: `${APP_URL}${item.path}`,
        })),
      },
      {
        '@type': 'ItemList',
        '@id': `${homeUrl}#cities`,
        name: 'مدن قطاع غزة',
        numberOfItems: cities.length,
        itemListElement: cities.map((city, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: city,
          url: `${APP_URL}/search?city=${encodeURIComponent(city)}`,
        })),
      },
    ],
  };
}
