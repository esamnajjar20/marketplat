-- FIX OAUTH-01: adds Google OAuth support to the users table.
--
-- passwordHash becomes nullable: existing rows are untouched (every
-- existing user already has a non-null passwordHash from local
-- register()), this only changes what's ALLOWED going forward for new
-- OAuth-only accounts created via GET /api/v1/auth/google/callback.
--
-- provider defaults to 'local' so every existing row is backfilled
-- correctly without a separate UPDATE statement.
--
-- googleId is nullable + unique: multiple NULLs are allowed by
-- Postgres's unique index semantics (NULL is never considered equal
-- to another NULL), so this is safe to add with no backfill needed.

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'OAUTH_LOGIN';
ALTER TYPE "AuditEventType" ADD VALUE 'OAUTH_ACCOUNT_LINKED';
ALTER TYPE "AuditEventType" ADD VALUE 'OAUTH_SIGNUP';

-- AlterTable
ALTER TABLE "users"
  ALTER COLUMN "passwordHash" DROP NOT NULL,
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
