CREATE TABLE "service_provider_service_types" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "attributes" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_provider_service_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_provider_service_types_providerId_serviceTypeId_key"
  ON "service_provider_service_types"("providerId", "serviceTypeId");
CREATE INDEX "service_provider_service_types_serviceTypeId_isActive_idx"
  ON "service_provider_service_types"("serviceTypeId", "isActive");

ALTER TABLE "service_provider_service_types"
  ADD CONSTRAINT "service_provider_service_types_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "service_provider_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_provider_service_types"
  ADD CONSTRAINT "service_provider_service_types_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "service_provider_service_types" ("id", "providerId", "serviceTypeId", "attributes", "isActive", "createdAt", "updatedAt")
SELECT md5(spd."id" || ':' || sl."serviceTypeId"), spd."id", sl."serviceTypeId", NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "service_provider_details" spd
JOIN (SELECT DISTINCT "providerId", "serviceTypeId" FROM "service_listings") sl
  ON sl."providerId" = spd."id"
ON CONFLICT ("providerId", "serviceTypeId") DO NOTHING;
