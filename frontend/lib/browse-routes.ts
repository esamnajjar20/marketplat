import { ROUTES } from '@/lib/constants';

/** Canonical public discovery destinations shared by ExploreSheet and navigation policy. */
export const BROWSE_ROUTE_PATHS = [
  ROUTES.home,
  ROUTES.search,
  ROUTES.ads,
  ROUTES.products,
  ROUTES.services,
  ROUTES.requests,
  ROUTES.stores,
  ROUTES.serviceProviders,
  ROUTES.sellersRanking,
] as const;

const PRIVATE_BROWSE_ROUTE_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  [ROUTES.ads]: [ROUTES.adCreate],
  [ROUTES.requests]: [ROUTES.myOpenRequests, ROUTES.myOpenRequestOffers, ROUTES.requestNew],
};

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/';
  if (path === '/') return '/';
  return path.replace(/\/+$/, '') || '/';
}

/** Route-aware active matching for public browse destinations and their detail pages. */
export function isBrowseRouteActive(pathname: string, href: string): boolean {
  const current = normalizePath(pathname);
  const route = normalizePath(href);

  if (route === ROUTES.home) return current === ROUTES.home;

  // /requests is the public market feed; account actions below it are not
  // part of Explore and must retain their own navigation context.
  const privateRoots = PRIVATE_BROWSE_ROUTE_PREFIXES[route] ?? [];
  if (privateRoots.some((privateRoot) => current === privateRoot || current.startsWith(`${privateRoot}/`))) {
    return false;
  }

  return current === route || current.startsWith(`${route}/`);
}
