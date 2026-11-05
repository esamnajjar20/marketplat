import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const layout = read('../app/layout.tsx');
const tailwind = read('../tailwind.config.ts');
const globals = read('../app/globals.css');
const eagerHome = read('../components/home/EagerHomeSections.tsx');
const recentAds = read('../components/home/RecentAds.tsx');
const carousel = read('../components/home/FeaturedCarousel.tsx');
const productCard = read('../components/stores/ProductCard.tsx');
const storeCard = read('../components/stores/StoreCard.tsx');
const followedStores = read('../components/stores/FollowedStoresList.tsx');
const storeHeader = read('../components/stores/StoreHeader.tsx');
const safeImage = read('../components/shared/ui/SafeImage.tsx');
const adCard = read('../components/ads/AdCard.tsx');
const serviceCard = read('../components/services/ServiceListingCard.tsx');

const checks = [
  ['Cairo and IBM Plex Mono are the only configured Google fonts',
    /import\s*\{\s*Cairo\s*,\s*IBM_Plex_Mono\s*\}\s*from\s*'next\/font\/google'/.test(layout) && !/import[^\n]*IBM_Plex_Sans_Arabic/.test(layout)],
  ['Cairo is the document font, not only a CSS variable',
    /className=\{`font-sans notranslate \$\{cairo\.variable\}/.test(layout)],
  ['IBM Plex Mono does not preload with the initial route',
    /variable:\s*'--font-ibm-plex-mono',[\s\S]*?preload:\s*false/.test(layout)],
  ['the unused IBM Plex Sans Arabic Tailwind alias falls back to Cairo',
    /'sans-arabic':\s*\['var\(--font-cairo\)',\s*'sans-serif'\]/.test(tailwind) && !globals.includes('--font-ibm-plex-sans-arabic')],
  ['home loading skeleton reuses the real carousel aspect-ratio token',
    eagerHome.includes('CAROUSEL_ASPECT') && eagerHome.includes('`${CAROUSEL_ASPECT} w-full rounded-2xl`')],
  ['below-the-fold recent-ad rail does not mark thumbnails as priority',
    !/priority=\{/.test(recentAds) && recentAds.includes('density="compact"')],
  ['only the first featured-carousel slide receives image priority',
    carousel.includes('priority={i === 0}') && carousel.includes('sizes="(max-width: 1280px) 100vw, 1280px"')],
  ['product list layout requests its actual 96px / 160px image slot',
    productCard.includes("layout === 'list' ? '(max-width: 640px) 96px, 160px'")],
  ['store cards calculate responsive cover sizes instead of oversizing every slot',
    storeCard.includes('resolvedCoverSizes') && storeCard.includes("compact\n      ? '(max-width: 640px) 100vw") && storeCard.includes('(max-width: 1535px) 23vw, 250px')],
  ['followed-store 2/3/4-column grid supplies matching cover sizes',
    followedStores.includes('coverSizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"')],
  ['store-detail cover sizes match its max-w-6xl (1152px) shell',
    storeHeader.includes('(max-width: 1024px) 90vw, 1152px')],
  ['SafeImage checks data-saver policy only when a blur payload exists',
    safeImage.includes('const usesBlurPlaceholder = placeholder === \'blur\' && Boolean(blurDataURL)') && safeImage.includes('if (!usesBlurPlaceholder) return;')],
  ['ad cards keep high-volume detail links out of automatic prefetch',
    adCard.includes('prefetch={false}')],
  ['product cards keep high-volume detail links out of automatic prefetch',
    productCard.includes('prefetch={false}')],
  ['store cards keep high-volume detail links out of automatic prefetch',
    storeCard.includes('prefetch={false}')],
  ['service cards keep high-volume detail links out of automatic prefetch',
    serviceCard.includes('prefetch={false}')],
  ['LCP image priority remains scoped to first image in detail galleries',
    read('../components/ads/AdDetailGallery.tsx').includes('priority={imageIndex === 0}') &&
    read('../components/stores/ProductDetailGallery.tsx').includes('priority={imageIndex === 0}') &&
    read('../components/services/ServiceListingGallery.tsx').includes('priority={imageIndex === 0}')],
];

for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
assert.ok(checks.every(([, ok]) => ok), 'Performance phase 5 audit failed');
console.log(`\n${checks.length}/${checks.length} checks passed`);
