-- TRACK-NEARBY-SEARCH: adds an optional precise lat/lng pin to Ad, the
-- same Decimal(9,6) shape StoreDetails and ServiceProviderDetails
-- already use. Nullable — city remains the required/primary location
-- signal for every ad; existing rows simply have no pin until their
-- owner sets one (or a future geocode-from-city backfill runs, out of
-- scope here). Enables GET /search's lat/lng nearby sort/filter across
-- ads and products.
ALTER TABLE "ads" ADD COLUMN "latitude" DECIMAL(9,6),
                   ADD COLUMN "longitude" DECIMAL(9,6);

-- Same composite-index rationale as service_provider_details_latitude_longitude_idx:
-- lets the nearby search's bounding-box pre-filter hit an index instead
-- of computing Haversine over every row.
CREATE INDEX "ads_latitude_longitude_idx" ON "ads"("latitude", "longitude");
