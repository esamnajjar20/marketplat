import { prisma } from '../../config/prisma';
import { Prisma, ServiceProviderDetails } from '@prisma/client';

export type ServiceProviderWithSeller = Prisma.ServiceProviderDetailsGetPayload<{
  include: {
    sellerProfile: true;
  };
}>;

export interface NearbyServiceProviderRow extends ServiceProviderDetails {
  distanceKm: number;
}

export const serviceProvidersRepository = {
  findBySellerProfileId: (sellerProfileId: string): Promise<ServiceProviderDetails | null> =>
    prisma.serviceProviderDetails.findUnique({ where: { sellerProfileId } }),

  findById: (id: string): Promise<ServiceProviderDetails | null> =>
    prisma.serviceProviderDetails.findUnique({ where: { id } }),

  findPublicById: (id: string): Promise<ServiceProviderWithSeller | null> =>
    prisma.serviceProviderDetails.findUnique({
      where: { id },
      include: { sellerProfile: true },
    }),

  create: (
    tx: Prisma.TransactionClient,
    sellerProfileId: string,
    data: {
      businessName: string;
      businessType: 'INDIVIDUAL' | 'SMALL_BUSINESS';
      logoUrl?: string;
      description: string;
      serviceAreaCities: string[];
      workingHours: Prisma.InputJsonValue;
      contactPhone: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<ServiceProviderDetails> =>
    tx.serviceProviderDetails.create({
      data: {
        sellerProfileId,
        businessName: data.businessName,
        businessType: data.businessType,
        logoUrl: data.logoUrl,
        description: data.description,
        serviceAreaCities: data.serviceAreaCities,
        workingHours: data.workingHours,
        contactPhone: data.contactPhone,
        latitude: data.latitude,
        longitude: data.longitude,
      },
    }),

  update: (
    id: string,
    data: Partial<{
      businessName: string;
      businessType: 'INDIVIDUAL' | 'SMALL_BUSINESS';
      logoUrl: string;
      description: string;
      serviceAreaCities: string[];
      workingHours: Prisma.InputJsonValue;
      contactPhone: string;
      availabilityStatus: 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE';
      latitude: number | null;
      longitude: number | null;
    }>
  ): Promise<ServiceProviderDetails> =>
    prisma.serviceProviderDetails.update({ where: { id }, data }),

  // services-design.md §11: Haversine distance via $queryRaw — sufficient
  // for single-region data volume; see §15/§18 for the PostGIS upgrade
  // path when the platform's geographic coverage grows. Only providers
  // with a lat/lng pin are eligible (serviceAreaCities remains the
  // primary/required geo mechanism for everyone else).
  //
  // Same id-then-refetch pattern as ads.repository.ts's search path:
  // $queryRaw returns only ids (+ the computed distance, which Prisma's
  // typed client can't produce), then a normal typed findMany fetches
  // the full rows — avoids raw-row Decimal/serialization mismatches
  // and keeps ServiceProviderDetails's real Prisma type everywhere else.
  findNearby: async (
    lat: number,
    lng: number,
    radiusKm: number,
    skip: number,
    take: number
  ): Promise<{ rows: NearbyServiceProviderRow[]; total: number }> => {
    const distanceExpr = Prisma.sql`
      6371 * acos(
        LEAST(1, GREATEST(-1,
          cos(radians(${lat})) * cos(radians("latitude")) *
          cos(radians("longitude") - radians(${lng})) +
          sin(radians(${lat})) * sin(radians("latitude"))
        ))
      )
    `;
    // PERF-FIX: the previous WHERE only had `IS NOT NULL` guards plus
    // the Haversine expression itself in the filter — neither touches
    // "latitude"/"longitude" as a plain comparison, so Postgres could
    // never use the existing @@index([latitude, longitude]) (schema.prisma)
    // and instead computed acos(...) for every single row in the table
    // on every search, radius or no. A degree of latitude is ~111km and
    // a degree of longitude shrinks toward the poles by cos(latitude),
    // so a simple +/- (radiusKm / 111) box around the query point is a
    // generous (never too small) rectangular superset of the true
    // circular radius — it can only ADMIT a few extra corner rows for
    // the exact Haversine filter below to then exclude, never wrongly
    // exclude a true match. This bounding box uses the plain columns
    // directly, so it hits the index and cuts the row count Postgres
    // has to run acos() on from the full table down to just the rows
    // in the query's neighborhood before the expensive expression ever
    // runs.
    const latDelta = radiusKm / 111;
    // Guard against lat ±90 wraparound producing a degenerate divisor
    // near the poles — clamps cos(lat) away from 0 rather than
    // dividing by (near-)zero. Gaza's own latitude (~31°N) never gets
    // close to this edge; it's here purely so the query stays correct
    // if this ever serves other regions.
    const lngDelta = radiusKm / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    const minLat = lat - latDelta;
    const maxLat = lat + latDelta;
    const minLng = lng - lngDelta;
    const maxLng = lng + lngDelta;

    const whereSql = Prisma.sql`
      WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        AND "latitude" BETWEEN ${minLat} AND ${maxLat}
        AND "longitude" BETWEEN ${minLng} AND ${maxLng}
        AND "availabilityStatus" != 'UNAVAILABLE'
        AND (${distanceExpr}) <= ${radiusKm}
    `;

    const [idRows, countRows] = await Promise.all([
      prisma.$queryRaw<{ id: string; distanceKm: number }[]>`
        SELECT "id", (${distanceExpr}) AS "distanceKm"
        FROM "service_provider_details"
        ${whereSql}
        ORDER BY "distanceKm" ASC
        OFFSET ${skip}
        LIMIT ${take}
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM "service_provider_details"
        ${whereSql}
      `,
    ]);

    if (idRows.length === 0) {
      return { rows: [], total: Number(countRows[0]?.count ?? 0) };
    }

    const distanceById = new Map(idRows.map(row => [row.id, row.distanceKm]));
    const providers = await prisma.serviceProviderDetails.findMany({
      where: { id: { in: idRows.map(row => row.id) } },
    });
    const providersById = new Map(providers.map(p => [p.id, p]));

    // Re-apply the DB's distance ordering — findMany's `in` filter does
    // not preserve idRows' order.
    const rows: NearbyServiceProviderRow[] = idRows
      .map(row => {
        const provider = providersById.get(row.id);
        if (!provider) return null;
        return { ...provider, distanceKm: distanceById.get(row.id) ?? row.distanceKm };
      })
      .filter((row): row is NearbyServiceProviderRow => row !== null);

    return { rows, total: Number(countRows[0]?.count ?? 0) };
  },
};
