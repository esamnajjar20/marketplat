-- Home discovery plan (Phase 1): GET /service-providers?city=Gaza
-- filters serviceAreaCities (String[]) via Prisma's `has`, which
-- compiles to Postgres `= ANY(...)` / `@>`-style array containment.
-- Without an index this is a sequential scan over every provider row
-- on every request. GIN is the correct index type for array
-- containment/overlap operators (@>, <@, &&, and the `has`/`hasSome`
-- Prisma emits) — a plain btree index cannot support them.
--
-- Not expressed as a Prisma `@@index(..., type: Gin)` because that
-- requires the `extendedIndexes` preview feature, which is not
-- enabled on this schema (see the Notification.data comment in
-- schema.prisma for the same precedent: GIN indexes here are added
-- via raw migration, not the Prisma index block).
CREATE INDEX "service_provider_details_serviceAreaCities_idx"
  ON "service_provider_details" USING GIN ("serviceAreaCities");
