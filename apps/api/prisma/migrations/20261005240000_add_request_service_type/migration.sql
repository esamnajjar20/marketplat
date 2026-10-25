ALTER TABLE "requests" ADD COLUMN "serviceTypeId" TEXT;

UPDATE "requests" r
SET "serviceTypeId" = sc."serviceTypeId"
FROM "service_categories" sc
WHERE r."type" = 'SERVICE'
  AND r."categoryId" = sc."id"
  AND r."serviceTypeId" IS NULL;

ALTER TABLE "requests"
  ADD CONSTRAINT "requests_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "requests_serviceTypeId_status_createdAt_idx"
  ON "requests"("serviceTypeId", "status", "createdAt");
