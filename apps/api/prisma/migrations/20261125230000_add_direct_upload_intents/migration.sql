CREATE TABLE "direct_upload_intents" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "direct_upload_intents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "direct_upload_intents_purpose_check" CHECK ("purpose" IN ('ads', 'products', 'service-listings', 'requests')),
    CONSTRAINT "direct_upload_intents_status_check" CHECK ("status" IN ('PENDING', 'CONSUMED'))
);

CREATE UNIQUE INDEX "direct_upload_intents_publicId_key" ON "direct_upload_intents"("publicId");
CREATE INDEX "direct_upload_intents_userId_purpose_status_expiresAt_idx"
    ON "direct_upload_intents"("userId", "purpose", "status", "expiresAt");
CREATE INDEX "direct_upload_intents_expiresAt_idx" ON "direct_upload_intents"("expiresAt");

ALTER TABLE "direct_upload_intents"
    ADD CONSTRAINT "direct_upload_intents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
