import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { SearchQuery } from './search.validation';
import { RawSearchRow, SearchType } from './search.types';

/**
 * Unified search across Ad / Product / StoreDetails / ServiceListing.
 *
 * WHY RAW SQL: Prisma has no type-safe UNION across different models —
 * each entity's `findMany` returns a different shape, and there's no
 * ORM-level way to interleave/rank/paginate them as one result set.
 * A UNION ALL in raw SQL is the standard approach here, same rationale
 * ads.repository.ts already uses for its own full-text search branch
 * (see its FIX PERF-01 / to_tsvector comments) — this module extends
 * that exact pattern across three more tables instead of introducing a
 * different technique.
 *
 * WHY EACH ENTITY NEEDS DIFFERENT HANDLING (this is the crux of the
 * whole module — every column below is deliberate, not copy-paste):
 *
 *   - name/title:  Ad/ServiceListing use `title`, Product/StoreDetails use `name`.
 *   - city:        Ad and StoreDetails carry city directly. Product has
 *                  NO city of its own — it inherits store_details.city
 *                  via storeId. ServiceListing has NO city either — a
 *                  provider serves a LIST of cities
 *                  (service_provider_details.serviceAreaCities, a
 *                  Postgres text[]), so "matches this city" is an
 *                  array-containment check (`= ANY(...)`), not equality.
 *   - rating:      None of the four tables has its own rating column.
 *                  Ad/Product/ServiceListing/StoreDetails all resolve
 *                  to a SellerProfile (directly for stores, via
 *                  sellerProfileId for ads, via storeId→sellerProfileId
 *                  for products, via providerId→sellerProfileId for
 *                  services) whose averageRating is the real source.
 *                  Ad.sellerProfileId is nullable at the schema level
 *                  (legacy safety net — ads.service.ts always sets it
 *                  on create today) so that one join is LEFT, not INNER,
 *                  with rating/verified coalesced to 0/false rather than
 *                  dropping the row.
 *   - views:       Ad/Product/ServiceListing all have it. StoreDetails
 *                  does NOT — hardcoded to 0 for stores rather than
 *                  omitted, so `sort=views` never breaks on a NULL.
 *   - full-text:   Every branch uses the identical
 *                  setweight(arabic_normalize(...)) || setweight(...)
 *                  expression the search_idx GIN indexes (see the
 *                  add_search_indexes migration and its follow-up
 *                  arabic_search_normalization migration) were built
 *                  from — the planner only uses a GIN expression index
 *                  when the query expression matches it verbatim, so
 *                  drifting the two apart silently gives up the index.
 *                  arabic_normalize() (defined in the latter migration)
 *                  folds Arabic alef/yeh letter-shape variants and
 *                  strips tatweel/diacritics on both the indexed
 *                  columns and the search term itself (see
 *                  buildTsQuery below) — see that migration's own
 *                  comment for which variants are folded and why.
 *   - distance:    TRACK-NEARBY-SEARCH. Same Haversine + bounding-box
 *                  approach as service-providers.repository.ts's own
 *                  findNearby (see haversineExprSql/boundingBoxSql
 *                  below) — deliberately not re-derived from scratch,
 *                  so both endpoints agree on what "distance in km"
 *                  means for the same two points. Ad/StoreDetails have
 *                  their own lat/lng columns; Product has none (like
 *                  its city, inherited via storeId → store_details);
 *                  ServiceListing has none either (inherited via
 *                  providerId → service_provider_details.latitude/
 *                  longitude, itself an OPT-IN precise pin distinct
 *                  from the required serviceAreaCities list). Every
 *                  branch always SELECTs a distance_km column — NULL
 *                  when the request carried no lat/lng, or when the
 *                  matched row's entity has no pin — so RawSearchRow's
 *                  shape never depends on whether the search was geo
 *                  or not.
 */

const ENTITY_URL_PREFIX: Record<'ad' | 'product' | 'store' | 'service', string> = {
  ad: '/ads',
  product: '/products',
  store: '/stores',
  service: '/services',
};

// TRACK-NEARBY-SEARCH: same Haversine expression as
// service-providers.repository.ts's own distanceExpr (kept byte-for-byte
// identical rather than re-derived, so the two endpoints can never
// silently disagree on what "distance in km" means for the same two
// points). latCol/lngCol are passed in as raw SQL identifiers (not
// bound values) since each branch's coordinate columns live on a
// different table/alias — ads.latitude directly, but products/services
// only have coordinates via their store/provider join.
function haversineExprSql(lat: number, lng: number, latCol: Prisma.Sql, lngCol: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(${lat})) * cos(radians(${latCol})) *
        cos(radians(${lngCol}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${latCol}))
      ))
    )
  `;
}

// Same bounding-box pre-filter rationale as
// service-providers.repository.ts's findNearby (see its own PERF-FIX
// comment for the full derivation) — a cheap rectangular superset of
// the true circular radius that hits a plain B-tree index on
// (latCol, lngCol) before the expensive Haversine expression ever runs
// on the surviving rows.
function boundingBoxSql(
  lat: number,
  lng: number,
  radiusKm: number,
  latCol: Prisma.Sql,
  lngCol: Prisma.Sql
): Prisma.Sql {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return Prisma.sql`
    ${latCol} IS NOT NULL AND ${lngCol} IS NOT NULL
    AND ${latCol} BETWEEN ${lat - latDelta} AND ${lat + latDelta}
    AND ${lngCol} BETWEEN ${lng - lngDelta} AND ${lng + lngDelta}
  `;
}

// FIX (mirrors ads.repository.ts's AD_SORT_COLUMN_SQL rationale): a
// Record keyed by the full SearchSort union means TypeScript rejects
// this file at compile time if search.types.ts's SEARCH_SORT_OPTIONS
// ever gains a value with no matching ORDER BY clause here — the same
// "forgot to update the raw-SQL path" class of bug that file's own
// comment documents fixing once already for ads.
//
// `rank` is ts_rank() when q is present, 0 otherwise (see each
// branch's SELECT) — ORDER BY rank falls back to recency when there's
// no search term, which is the sane "relevance" default for a browse
// (not search) request.
//
// TRACK-NEARBY-SEARCH: `distance` orders by distance_km ascending —
// NULLS LAST so any row a geo search couldn't resolve a distance for
// (a store/service with no lat/lng pin) sorts after every row that
// did, rather than Postgres's NULLS-first default for ASC pushing
// them to the top. search.validation.ts's searchQuerySchema rejects
// sort=distance with no lat/lng before this is ever reached, so
// distance_km being NULL on every row (a search with no geo at all)
// is not a case this ordering needs to handle specially.
const SORT_ORDER_BY_SQL: Record<SearchQuery['sort'], Prisma.Sql> = {
  relevance: Prisma.sql`rank DESC, created_at DESC`,
  rating: Prisma.sql`rating DESC, rank DESC, created_at DESC`,
  newest: Prisma.sql`created_at DESC`,
  views: Prisma.sql`views DESC, rank DESC, created_at DESC`,
  distance: Prisma.sql`distance_km ASC NULLS LAST, rank DESC, created_at DESC`,
};

// FIX M-022: previously each branch (adBranch/productBranch/...) ran
// with no LIMIT of its own — every matching row from all four tables
// was materialized, UNION ALL'd together, and only THEN sorted/offset/
// limited for the page actually being returned. With a broad query
// (or no query text at all — type=all, no filters) against a large
// table, this means pulling every active row from every table into
// memory before discarding all but `take` of them.
//
// Each branch is now wrapped with the SAME ORDER BY the outer query
// uses and a LIMIT of its own — `skip + take` rows is enough for any
// single branch to guarantee correctness (the page being requested
// can contain at most `skip + take` rows total from any one branch,
// since it's already sorted the same way outer query will re-sort the
// combined set), multiplied by a small safety factor and capped at a
// hard ceiling so a pathological page/limit combination can't make
// the per-branch limit unbounded again. The final ORDER BY/OFFSET/
// LIMIT on the combined result is unchanged and still produces
// identical results to the unlimited version — this only prunes rows
// that could never appear on the requested page in the first place.
const PER_BRANCH_LIMIT_SAFETY_FACTOR = 2;
const PER_BRANCH_LIMIT_CEILING = 500;

function perBranchLimit(skip: number, take: number): number {
  return Math.min((skip + take) * PER_BRANCH_LIMIT_SAFETY_FACTOR, PER_BRANCH_LIMIT_CEILING);
}

// FIX SEARCH-AR-01: arabic_normalize() wraps the search term here so
// every branch below (ad/product/store/service, all of which now also
// wrap their own tsvector columns) compares like-for-like — see the
// arabic_search_normalization migration for what's folded and why.
// Applied once here rather than in all four branches individually,
// since every branch calls this same function to build its tsQuery.
const buildTsQuery = (q: string | undefined) =>
  q ? Prisma.sql`plainto_tsquery('simple', arabic_normalize(${q}))` : null;

// TRACK-NEARBY-SEARCH: threaded through every *Branch builder as one
// param object (rather than three positional lat/lng/radius args) so
// adding it didn't churn every branch's call site signature — each
// branch reads .lat/.lng/.radiusKm only when computing its own
// distance_km/bounding-box condition, and is free to ignore it
// entirely (none currently do, but a future entity with no
// coordinates at all could).
interface GeoParams {
  lat: number;
  lng: number;
  radiusKm: number;
}

// Explicit shared signature for every *Branch builder below — without
// this, TypeScript infers each function's own return type
// independently (Prisma.Sql for three of them, Prisma.Sql | null for
// storeBranch), and BRANCH_BUILDERS's Record type further down would
// need to union four distinct function types instead of one. Storing
// them under one named type keeps that Record declaration honest and
// makes the "any branch may opt out by returning null" contract explicit.
type BranchBuilder = (
  tsQuery: Prisma.Sql | null,
  categoryId: string | undefined,
  city: string | undefined,
  geo: GeoParams | null
) => Prisma.Sql | null;

// Each branch computes its own tsvector/rank inline (rather than
// reading a generated column) — see the migration header comment for
// why: no schema.prisma model changes were introduced for this
// feature, so there's nowhere to persist a generated tsvector column.
// The GIN indexes still speed up matching because the expression is
// byte-for-byte identical to what's indexed.
const adBranch: BranchBuilder = (tsQuery, categoryId, city, geo) => {
  const conditions: Prisma.Sql[] = [Prisma.sql`a."status" = 'ACTIVE'`];
  if (tsQuery) {
    conditions.push(Prisma.sql`(
      setweight(to_tsvector('simple', arabic_normalize(coalesce(a."title", ''))), 'A') ||
      setweight(to_tsvector('simple', arabic_normalize(coalesce(a."description", ''))), 'B')
    ) @@ ${tsQuery}`);
  }
  if (categoryId) conditions.push(Prisma.sql`a."categoryId" = ${categoryId}`);
  if (city) conditions.push(Prisma.sql`a."city" = ${city}`);

  const rankExpr = tsQuery
    ? Prisma.sql`ts_rank(
        setweight(to_tsvector('simple', arabic_normalize(coalesce(a."title", ''))), 'A') ||
        setweight(to_tsvector('simple', arabic_normalize(coalesce(a."description", ''))), 'B'),
        ${tsQuery}
      )`
    : Prisma.sql`0`;

  // TRACK-NEARBY-SEARCH: ads.latitude/longitude are direct columns
  // (products/stores/services below resolve theirs via a join or, for
  // products, through their store), so this branch needs no extra join
  // for coordinates. A geo search does NOT exclude ads with no pin
  // (this stays an opt-in signal, same as service-providers.repository.ts's
  // own "only providers with a lat/lng pin are eligible" note, applied
  // per-row instead of per-table here) — the bounding box below only
  // narrows results by radius; ads with no pin simply get a null
  // distance_km and sort last under sort=distance (see SORT_ORDER_BY_SQL).
  let distanceExpr = Prisma.sql`NULL::float`;
  if (geo) {
    distanceExpr = haversineExprSql(geo.lat, geo.lng, Prisma.sql`a."latitude"`, Prisma.sql`a."longitude"`);
  }
  if (geo && city === undefined) {
    // Only narrow by radius when there's no explicit city filter — city
    // and radius both answer "where", and stacking both as an AND would
    // silently produce a combination no caller reading
    // searchQuerySchema's shape would expect (e.g. "Gaza City AND
    // within 10km of some other point" could easily be empty). A geo
    // search WITH a city filter still computes/returns distance_km
    // (sort=distance keeps working) — it just doesn't use radius to
    // exclude rows on top of the city filter already narrowing them.
    conditions.push(Prisma.sql`(
      a."latitude" IS NULL OR (${boundingBoxSql(geo.lat, geo.lng, geo.radiusKm, Prisma.sql`a."latitude"`, Prisma.sql`a."longitude"`)}
        AND (${distanceExpr}) <= ${geo.radiusKm})
    )`);
  }

  return Prisma.sql`
    SELECT
      a."id" AS id, 'ad'::text AS type, a."title" AS title, a."description" AS description,
      (a."images")[1] AS image, a."city" AS city,
      coalesce(sp."averageRating", 0)::float AS rating, a."views" AS views,
      a."price"::text AS price,
      coalesce(sp."id", a."userId") AS seller_id,
      coalesce(sp."displayName", u."name") AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      -- FIX M-023: mirrors the seller_id coalesce directly above — when
      -- sp (seller_profiles) is null we fell back to a."userId", so the
      -- type must say 'user' in that exact case, not 'seller_profile'.
      (CASE WHEN sp."id" IS NULL THEN 'user' ELSE 'seller_profile' END)::text AS seller_type,
      a."id" AS url_id, a."createdAt" AS created_at,
      (${rankExpr})::float AS rank,
      (${distanceExpr})::float AS distance_km
    FROM "ads" a
    LEFT JOIN "seller_profiles" sp ON sp."id" = a."sellerProfileId"
    JOIN "users" u ON u."id" = a."userId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const productBranch: BranchBuilder = (tsQuery, categoryId, city, geo) => {
  const conditions: Prisma.Sql[] = [Prisma.sql`p."status" = 'ACTIVE'`, Prisma.sql`st."status" = 'ACTIVE'`];
  if (tsQuery) {
    conditions.push(Prisma.sql`(
      setweight(to_tsvector('simple', arabic_normalize(coalesce(p."name", ''))), 'A') ||
      setweight(to_tsvector('simple', arabic_normalize(coalesce(p."description", ''))), 'B')
    ) @@ ${tsQuery}`);
  }
  if (categoryId) conditions.push(Prisma.sql`p."categoryId" = ${categoryId}`);
  // Product has no own city — inherited from its store (see header comment).
  if (city) conditions.push(Prisma.sql`st."city" = ${city}`);

  const rankExpr = tsQuery
    ? Prisma.sql`ts_rank(
        setweight(to_tsvector('simple', arabic_normalize(coalesce(p."name", ''))), 'A') ||
        setweight(to_tsvector('simple', arabic_normalize(coalesce(p."description", ''))), 'B'),
        ${tsQuery}
      )`
    : Prisma.sql`0`;

  // TRACK-NEARBY-SEARCH: Product has no lat/lng of its own — inherited
  // from its store (st."latitude"/st."longitude"), the same "no own
  // city either" relationship as the city filter directly above.
  let distanceExpr = Prisma.sql`NULL::float`;
  if (geo) {
    distanceExpr = haversineExprSql(geo.lat, geo.lng, Prisma.sql`st."latitude"`, Prisma.sql`st."longitude"`);
  }
  if (geo && city === undefined) {
    // Same "don't stack radius on top of an explicit city filter"
    // rationale as adBranch's identical condition above.
    conditions.push(Prisma.sql`(
      st."latitude" IS NULL OR (${boundingBoxSql(geo.lat, geo.lng, geo.radiusKm, Prisma.sql`st."latitude"`, Prisma.sql`st."longitude"`)}
        AND (${distanceExpr}) <= ${geo.radiusKm})
    )`);
  }

  return Prisma.sql`
    SELECT
      p."id" AS id, 'product'::text AS type, p."name" AS title, p."description" AS description,
      (p."images")[1] AS image, st."city" AS city,
      coalesce(sp."averageRating", 0)::float AS rating, p."views" AS views,
      p."price"::text AS price,
      st."id" AS seller_id, st."name" AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      -- FIX M-023: seller_id here is always store_details.id (see
      -- header comment), never a bare user/seller-profile id.
      'store'::text AS seller_type,
      p."id" AS url_id, p."createdAt" AS created_at,
      (${rankExpr})::float AS rank,
      (${distanceExpr})::float AS distance_km
    FROM "products" p
    JOIN "store_details" st ON st."id" = p."storeId"
    LEFT JOIN "seller_profiles" sp ON sp."id" = st."sellerProfileId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const storeBranch: BranchBuilder = (tsQuery, categoryId, city, geo) => {
  // Stores have no category of their own (ProductCategory/ServiceCategory
  // belong to their listings, not the store) — a categoryId filter
  // can never match a store, so this branch is skipped entirely rather
  // than silently returning zero rows through a WHERE that can never
  // be true. Same short-circuit for city, applied below.
  if (categoryId) return null;

  const conditions: Prisma.Sql[] = [Prisma.sql`st."status" = 'ACTIVE'`];
  if (tsQuery) {
    conditions.push(Prisma.sql`(
      setweight(to_tsvector('simple', arabic_normalize(coalesce(st."name", ''))), 'A') ||
      setweight(to_tsvector('simple', arabic_normalize(coalesce(st."description", ''))), 'B')
    ) @@ ${tsQuery}`);
  }
  if (city) conditions.push(Prisma.sql`st."city" = ${city}`);

  const rankExpr = tsQuery
    ? Prisma.sql`ts_rank(
        setweight(to_tsvector('simple', arabic_normalize(coalesce(st."name", ''))), 'A') ||
        setweight(to_tsvector('simple', arabic_normalize(coalesce(st."description", ''))), 'B'),
        ${tsQuery}
      )`
    : Prisma.sql`0`;

  // TRACK-NEARBY-SEARCH: store_details has its own latitude/longitude
  // directly — no join needed, same shape as adBranch.
  let distanceExpr = Prisma.sql`NULL::float`;
  if (geo) {
    distanceExpr = haversineExprSql(geo.lat, geo.lng, Prisma.sql`st."latitude"`, Prisma.sql`st."longitude"`);
  }
  if (geo && city === undefined) {
    conditions.push(Prisma.sql`(
      st."latitude" IS NULL OR (${boundingBoxSql(geo.lat, geo.lng, geo.radiusKm, Prisma.sql`st."latitude"`, Prisma.sql`st."longitude"`)}
        AND (${distanceExpr}) <= ${geo.radiusKm})
    )`);
  }

  return Prisma.sql`
    SELECT
      st."id" AS id, 'store'::text AS type, st."name" AS title, st."description" AS description,
      st."logoUrl" AS image, st."city" AS city,
      coalesce(sp."averageRating", 0)::float AS rating,
      0 AS views,
      NULL::text AS price,
      st."id" AS seller_id, st."name" AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      -- FIX M-023: the store IS the seller here (seller_id = st.id
      -- itself, not a foreign reference), still type 'store' either way.
      'store'::text AS seller_type,
      st."id" AS url_id, st."createdAt" AS created_at,
      (${rankExpr})::float AS rank,
      (${distanceExpr})::float AS distance_km
    FROM "store_details" st
    LEFT JOIN "seller_profiles" sp ON sp."id" = st."sellerProfileId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const serviceBranch: BranchBuilder = (tsQuery, categoryId, city, geo) => {
  const conditions: Prisma.Sql[] = [Prisma.sql`sl."status" = 'ACTIVE'`];
  if (tsQuery) {
    conditions.push(Prisma.sql`(
      setweight(to_tsvector('simple', arabic_normalize(coalesce(sl."title", ''))), 'A') ||
      setweight(to_tsvector('simple', arabic_normalize(coalesce(sl."description", ''))), 'B')
    ) @@ ${tsQuery}`);
  }
  if (categoryId) conditions.push(Prisma.sql`sl."categoryId" = ${categoryId}`);
  // provider.serviceAreaCities is a text[] — containment check, not
  // equality, same relation-filter approach
  // service-listings.repository.ts's ORM path already uses (`has: city`).
  if (city) conditions.push(Prisma.sql`${city} = ANY(pr."serviceAreaCities")`);

  const rankExpr = tsQuery
    ? Prisma.sql`ts_rank(
        setweight(to_tsvector('simple', arabic_normalize(coalesce(sl."title", ''))), 'A') ||
        setweight(to_tsvector('simple', arabic_normalize(coalesce(sl."description", ''))), 'B'),
        ${tsQuery}
      )`
    : Prisma.sql`0`;

  // A provider can serve several cities; when a city filter is active
  // every row here already matched it (see the ANY() condition above),
  // so that filter value IS the representative city for display —
  // no need to re-derive it from the array. Without a filter, the
  // array's first entry is shown as a representative value. Built as
  // a plain Prisma.Sql (not a bound ${city} param) specifically so it
  // composes as a SQL expression, not a value, inside the SELECT list.
  const cityExpr = city ? Prisma.sql`${city}::text` : Prisma.sql`pr."serviceAreaCities"[1]`;

  // TRACK-NEARBY-SEARCH: providers are pinned via
  // service_provider_details.latitude/longitude (an OPT-IN precise pin
  // — serviceAreaCities remains the primary/required geo mechanism for
  // every provider, same distinction service-providers.repository.ts's
  // own findNearby draws). A city filter and radius filter are not
  // mutually exclusive here the way they are in the other three
  // branches — a provider's city match comes from the serviceAreaCities
  // array, a wholly separate mechanism from the lat/lng pin, so both
  // can be applied together without the "double narrowing" risk the
  // other branches' city/radius guard exists to avoid.
  let distanceExpr = Prisma.sql`NULL::float`;
  if (geo) {
    distanceExpr = haversineExprSql(geo.lat, geo.lng, Prisma.sql`pr."latitude"`, Prisma.sql`pr."longitude"`);
    conditions.push(Prisma.sql`(
      pr."latitude" IS NULL OR (${boundingBoxSql(geo.lat, geo.lng, geo.radiusKm, Prisma.sql`pr."latitude"`, Prisma.sql`pr."longitude"`)}
        AND (${distanceExpr}) <= ${geo.radiusKm})
    )`);
  }

  return Prisma.sql`
    SELECT
      sl."id" AS id, 'service'::text AS type, sl."title" AS title, sl."description" AS description,
      (sl."images")[1] AS image,
      ${cityExpr} AS city,
      coalesce(sp."averageRating", 0)::float AS rating, sl."views" AS views,
      sl."price"::text AS price,
      pr."id" AS seller_id, pr."businessName" AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      -- FIX M-023: seller_id is service_provider_details.id, never a
      -- seller_profiles id directly (sp is only joined for rating/verified).
      'service_provider'::text AS seller_type,
      sl."id" AS url_id, sl."createdAt" AS created_at,
      (${rankExpr})::float AS rank,
      (${distanceExpr})::float AS distance_km
    FROM "service_listings" sl
    JOIN "service_provider_details" pr ON pr."id" = sl."providerId"
    LEFT JOIN "seller_profiles" sp ON sp."id" = pr."sellerProfileId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const BRANCH_BUILDERS: Record<Exclude<SearchType, 'all'>, BranchBuilder> = {
  ads: adBranch,
  products: productBranch,
  stores: storeBranch,
  services: serviceBranch,
};

export const searchRepository = {
  search: async (
    query: SearchQuery
  ): Promise<{ rows: RawSearchRow[]; total: number }> => {
    const { q, city, type, categoryId, sort, page = 1, limit = 20, lat, lng, radius } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const tsQuery = buildTsQuery(q);

    // TRACK-NEARBY-SEARCH: searchQuerySchema's .refine() already
    // guarantees lat/lng arrive together (both present or both
    // absent), so this is a safe single condition, not two independent
    // undefined checks that could disagree.
    const geo: GeoParams | null = lat !== undefined && lng !== undefined ? { lat, lng, radiusKm: radius } : null;

    const typesToQuery: Exclude<SearchType, 'all'>[] =
      type === 'all' ? ['ads', 'products', 'stores', 'services'] : [type];

    const branches = typesToQuery
      .map(t => BRANCH_BUILDERS[t](tsQuery, categoryId, city, geo))
      .filter((branch): branch is Prisma.Sql => branch !== null);

    // categoryId narrowed type=all down to zero eligible branches (e.g.
    // type=all with categoryId pointed at a store, which can never
    // match) — short-circuit rather than issuing SQL with an empty
    // UNION, which Postgres rejects outright.
    if (branches.length === 0) {
      return { rows: [], total: 0 };
    }

    const orderBySql = SORT_ORDER_BY_SQL[sort];

    // FIX M-022: cap what each branch can contribute to the *result
    // rows* before the UNION ALL — see perBranchLimit's own comment
    // above for why `skip + take` (with a safety factor and hard
    // ceiling) is enough to keep the returned page identical to the
    // unlimited version. The COUNT query below deliberately does NOT
    // use this same limited union — capping rows before UNION ALL is
    // safe for "which rows appear on this page" (they're sorted first,
    // so only rows that could never appear on the page get dropped)
    // but would make `total` wrong the moment any branch has more
    // matches than the per-branch cap. COUNT(*) never materializes
    // full rows regardless of table size, so leaving it unlimited
    // doesn't reintroduce the memory-blowup problem this fix is for —
    // only the row-fetching side needed the limit.
    const branchLimit = perBranchLimit(skip, take);
    const limitedBranches = branches.map(
      b => Prisma.sql`(SELECT * FROM (${b}) branch_rows ORDER BY ${orderBySql} LIMIT ${branchLimit})`
    );
    const limitedUnion = Prisma.join(limitedBranches, ' UNION ALL ');

    const unlimitedUnion = Prisma.join(
      branches.map(b => Prisma.sql`(${b})`),
      ' UNION ALL '
    );

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawSearchRow[]>`
        SELECT * FROM (${limitedUnion}) combined
        ORDER BY ${orderBySql}
        OFFSET ${skip}
        LIMIT ${take}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (${unlimitedUnion}) combined
      `,
    ]);

    return { rows, total: Number(countRows[0]?.count ?? 0) };
  },

  buildUrl: (type: RawSearchRow['type'], id: string): string => `${ENTITY_URL_PREFIX[type]}/${id}`,

  /**
   * Autocomplete source: distinct name/title matches across products,
   * stores, and both category trees (product + service) — a lighter,
   * prefix-oriented query, not the same ranked/paginated path as
   * search(). Deliberately excludes ads (title volume/churn there
   * would dominate suggestions with noisy one-off listings) and
   * "recent searches" (would need a new table — out of scope for this
   * pass, see design discussion).
   */
  suggest: async (prefix: string, limit = 8): Promise<string[]> => {
    // ILIKE treats %, _, and the escape character itself as pattern
    // metacharacters — a user typing e.g. "50% off" or "a_b" as a
    // literal search term would otherwise have those characters
    // silently reinterpreted as wildcards, matching far more (or
    // differently) than the literal prefix they typed. Escaping them
    // makes ILIKE treat the whole prefix as literal text, only the
    // trailing '%' this function itself appends stays a wildcard.
    //
    // '!' (not the SQL-conventional '\') is used as the ESCAPE
    // character specifically so the JS string literal below doesn't
    // need a second, easy-to-get-wrong layer of backslash-escaping on
    // top of the SQL layer — '!' needs no JS escaping at all, and is
    // vanishingly unlikely to appear in a product/store/category name
    // (unlike '\', which some data could legitimately contain).
    const escapedPrefix = prefix.replace(/[!%_]/g, char => `!${char}`);
    // FIX SEARCH-AR-01: normalizes the prefix the same way the main
    // search() path now does — otherwise suggestions and the results
    // they lead to would disagree on which letter-shape variants count
    // as a match (e.g. autocomplete matching أحمد but the resulting
    // search for "أحمد" not finding a listing stored as "احمد", or vice
    // versa). arabic_normalize() is applied inside SQL to BOTH the
    // prefix parameter and the stored columns below, rather than
    // duplicating the same folding logic as a second implementation in
    // JS — one canonical definition (the Postgres function) that both
    // this and search() call, so the two paths can never silently
    // drift apart from each other.
    //
    // AUDIT-FIX 1.2: this used to be a plain ILIKE with no supporting
    // index — arabic_normalize(column) was evaluated fresh on every row
    // of every call (a full scan of products/store_details/*_categories
    // per keystroke). Two changes together fix that, matched exactly to
    // the add_autocomplete_prefix_indexes migration's index definitions:
    //   - ILIKE -> explicit lower(...) LIKE lower(...): the planner only
    //     matches a text_pattern_ops btree index against the plain LIKE
    //     (~~) operator, not ILIKE's case-insensitive (~~*) operator —
    //     ILIKE would silently keep falling back to a sequential scan
    //     even with the index in place.
    //   - the "status"/"isActive" filters below must stay byte-for-byte
    //     identical to each index's WHERE clause, since these are
    //     partial indexes — the planner only uses a partial index when
    //     it can prove the query's WHERE clause implies the index's.
    const rawPrefix = `${escapedPrefix}%`;

    const [products, stores, productCategories, serviceCategories] = await Promise.all([
      prisma.$queryRaw<{ name: string }[]>`
        SELECT DISTINCT "name" FROM "products"
        WHERE "status" = 'ACTIVE'
          AND lower(arabic_normalize("name")) LIKE lower(arabic_normalize(${rawPrefix})) ESCAPE '!'
        LIMIT ${limit}
      `,
      prisma.$queryRaw<{ name: string }[]>`
        SELECT DISTINCT "name" FROM "store_details"
        WHERE "status" = 'ACTIVE'
          AND lower(arabic_normalize("name")) LIKE lower(arabic_normalize(${rawPrefix})) ESCAPE '!'
        LIMIT ${limit}
      `,
      prisma.$queryRaw<{ nameAr: string }[]>`
        SELECT DISTINCT "nameAr" FROM "product_categories"
        WHERE "isActive" = true
          AND lower(arabic_normalize("nameAr")) LIKE lower(arabic_normalize(${rawPrefix})) ESCAPE '!'
        LIMIT ${limit}
      `,
      prisma.$queryRaw<{ nameAr: string }[]>`
        SELECT DISTINCT "nameAr" FROM "service_categories"
        WHERE "isActive" = true
          AND lower(arabic_normalize("nameAr")) LIKE lower(arabic_normalize(${rawPrefix})) ESCAPE '!'
        LIMIT ${limit}
      `,
    ]);

    const merged = [
      ...products.map(p => p.name),
      ...stores.map(s => s.name),
      ...productCategories.map(c => c.nameAr),
      ...serviceCategories.map(c => c.nameAr),
    ];

    // De-dupe (a product and a category can share a name) while
    // preserving first-seen order, then cap to the requested limit —
    // the four queries above can together return up to 4×limit rows.
    return Array.from(new Set(merged)).slice(0, limit);
  },
};
