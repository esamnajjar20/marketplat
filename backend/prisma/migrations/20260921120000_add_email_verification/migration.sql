-- FIX FEAT-EMAIL-VERIFY: add email verification fields + token table.
--
-- Existing users are backfilled to emailVerified = true (they signed
-- up before this feature existed and shouldn't be retroactively
-- blocked). New local registrations default to false; new
-- Google-signup users are created with true by the application layer.

ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "users" SET "emailVerified" = true, "emailVerifiedAt" = "createdAt";

CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FIX FEAT-EMAIL-VERIFY: add EMAIL_VERIFIED to the AuditEventType enum.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so
-- it must be its own statement at the end of this migration.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'EMAIL_VERIFIED';
