import Link from 'next/link';
import { CITIES, ROUTES } from '@/lib/constants';

const BROWSE = [
  { label: 'الإعلانات', href: `${ROUTES.search}?type=ads` },
  { label: 'المنتجات', href: ROUTES.products },
  { label: 'الخدمات', href: ROUTES.services },
  { label: 'المتاجر', href: ROUTES.stores },
  { label: 'مقدمو الخدمات', href: ROUTES.serviceProviders },
] as const;

/**
 * Phase E: internal SEO / discovery links — cities + main browse hubs.
 * Server-friendly (no client hooks); rendered near the bottom of home.
 */
export function HomeBrowseLinks() {
  return (
    <nav
      className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3"
      aria-label="روابط الاستكشاف"
    >
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">تصفّح حسب النوع</p>
        <ul className="flex flex-wrap gap-2">
          {BROWSE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                className="inline-flex rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">مدن قطاع غزة</p>
        <ul className="flex flex-wrap gap-2">
          {CITIES.map((city) => (
            <li key={city}>
              <Link
                href={`${ROUTES.search}?city=${encodeURIComponent(city)}`}
                prefetch={false}
                className="inline-flex rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {city}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
