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
 */

const ENTITY_URL_PREFIX: Record<'ad' | 'product' | 'store' | 'service', string> = {
  ad: '/ads',
  product: '/products',
  store: '/stores',
  service: '/services',
};

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
const SORT_ORDER_BY_SQL: Record<SearchQuery['sort'], Prisma.Sql> = {
  relevance: Prisma.sql`rank DESC, created_at DESC`,
  rating: Prisma.sql`rating DESC, rank DESC, created_at DESC`,
  newest: Prisma.sql`created_at DESC`,
  views: Prisma.sql`views DESC, rank DESC, created_at DESC`,
};

// FIX SEARCH-AR-01: arabic_normalize() wraps the search term here so
// every branch below (ad/product/store/service, all of which now also
// wrap their own tsvector columns) compares like-for-like — see the
// arabic_search_normalization migration for what's folded and why.
// Applied once here rather than in all four branches individually,
// since every branch calls this same function to build its tsQuery.
const buildTsQuery = (q: string | undefined) =>
  q ? Prisma.sql`plainto_tsquery('simple', arabic_normalize(${q}))` : null;

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
  city: string | undefined
) => Prisma.Sql | null;

// Each branch computes its own tsvector/rank inline (rather than
// reading a generated column) — see the migration header comment for
// why: no schema.prisma model changes were introduced for this
// feature, so there's nowhere to persist a generated tsvector column.
// The GIN indexes still speed up matching because the expression is
// byte-for-byte identical to what's indexed.
const adBranch: BranchBuilder = (tsQuery, categoryId, city) => {
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

  return Prisma.sql`
    SELECT
      a."id" AS id, 'ad'::text AS type, a."title" AS title, a."description" AS description,
      (a."images")[1] AS image, a."city" AS city,
      coalesce(sp."averageRating", 0)::float AS rating, a."views" AS views,
      a."price"::text AS price,
      coalesce(sp."id", a."userId") AS seller_id,
      coalesce(sp."displayName", u."name") AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      a."id" AS url_id, a."createdAt" AS created_at,
      (${rankExpr})::float AS rank
    FROM "ads" a
    LEFT JOIN "seller_profiles" sp ON sp."id" = a."sellerProfileId"
    JOIN "users" u ON u."id" = a."userId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const productBranch: BranchBuilder = (tsQuery, categoryId, city) => {
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

  return Prisma.sql`
    SELECT
      p."id" AS id, 'product'::text AS type, p."name" AS title, p."description" AS description,
      (p."images")[1] AS image, st."city" AS city,
      coalesce(sp."averageRating", 0)::float AS rating, p."views" AS views,
      p."price"::text AS price,
      st."id" AS seller_id, st."name" AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      p."id" AS url_id, p."createdAt" AS created_at,
      (${rankExpr})::float AS rank
    FROM "products" p
    JOIN "store_details" st ON st."id" = p."storeId"
    LEFT JOIN "seller_profiles" sp ON sp."id" = st."sellerProfileId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const storeBranch: BranchBuilder = (tsQuery, categoryId, city) => {
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

  return Prisma.sql`
    SELECT
      st."id" AS id, 'store'::text AS type, st."name" AS title, st."description" AS description,
      st."logoUrl" AS image, st."city" AS city,
      coalesce(sp."averageRating", 0)::float AS rating,
      0 AS views,
      NULL::text AS price,
      st."id" AS seller_id, st."name" AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      st."id" AS url_id, st."createdAt" AS created_at,
      (${rankExpr})::float AS rank
    FROM "store_details" st
    LEFT JOIN "seller_profiles" sp ON sp."id" = st."sellerProfileId"
    WHERE ${Prisma.join(conditions, ' AND ')}
  `;
};

const serviceBranch: BranchBuilder = (tsQuery, categoryId, city) => {
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

  return Prisma.sql`
    SELECT
      sl."id" AS id, 'service'::text AS type, sl."title" AS title, sl."description" AS description,
      (sl."images")[1] AS image,
      ${cityExpr} AS city,
      coalesce(sp."averageRating", 0)::float AS rating, sl."views" AS views,
      sl."price"::text AS price,
      pr."id" AS seller_id, pr."businessName" AS seller_name,
      coalesce(sp."verified", false) AS seller_verified,
      sl."id" AS url_id, sl."createdAt" AS created_at,
      (${rankExpr})::float AS rank
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
    const { q, city, type, categoryId, sort, page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const tsQuery = buildTsQuery(q);

    const typesToQuery: Exclude<SearchType, 'all'>[] =
      type === 'all' ? ['ads', 'products', 'stores', 'services'] : [type];

    const branches = typesToQuery
      .map(t => BRANCH_BUILDERS[t](tsQuery, categoryId, city))
      .filter((branch): branch is Prisma.Sql => branch !== null);

    // categoryId narrowed type=all down to zero eligible branches (e.g.
    // type=all with categoryId pointed at a store, which can never
    // match) — short-circuit rather than issuing SQL with an empty
    // UNION, which Postgres rejects outright.
    if (branches.length === 0) {
      return { rows: [], total: 0 };
    }

    const unioned = Prisma.join(
      branches.map(b => Prisma.sql`(${b})`),
      ' UNION ALL '
    );

    const orderBySql = SORT_ORDER_BY_SQL[sort];

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawSearchRow[]>`
        SELECT * FROM (${unioned}) combined
        ORDER BY ${orderBySql}
        OFFSET ${skip}
        LIMIT ${take}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM (${unioned}) combined
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
    // drift apart from each other. There's no existing index on these
    // name/nameAr columns to preserve or invalidate (schema.prisma has
    // none), so wrapping the column expression costs nothing extra it
    // wasn't already paying with a sequential scan.
    const rawPrefix = `${escapedPrefix}%`;

    const [products, stores, productCategories, serviceCategories] = await Promise.all([
      prisma.$queryRaw<{ name: string }[]>`
        SELECT DISTINCT "name" FROM "products"
        WHERE "status" = 'ACTIVE' AND arabic_normalize("name") ILIKE arabic_normalize(${rawPrefix}) ESCAPE '!'
        LIMIT ${limit}
      `,
      prisma.$queryRaw<{ name: string }[]>`
        SELECT DISTINCT "name" FROM "store_details"
        WHERE "status" = 'ACTIVE' AND arabic_normalize("name") ILIKE arabic_normalize(${rawPrefix}) ESCAPE '!'
        LIMIT ${limit}
      `,
      prisma.$queryRaw<{ nameAr: string }[]>`
        SELECT DISTINCT "nameAr" FROM "product_categories"
        WHERE "isActive" = true AND arabic_normalize("nameAr") ILIKE arabic_normalize(${rawPrefix}) ESCAPE '!'
        LIMIT ${limit}
      `,
      prisma.$queryRaw<{ nameAr: string }[]>`
        SELECT DISTINCT "nameAr" FROM "service_categories"
        WHERE "isActive" = true AND arabic_normalize("nameAr") ILIKE arabic_normalize(${rawPrefix}) ESCAPE '!'
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
