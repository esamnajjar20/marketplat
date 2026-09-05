-- STORE-MEMBERS (Staff permissions inside a store)
-- Lets a store owner invite other users as MANAGER / STAFF / EDITOR
-- with scoped capabilities. OWNER is implicit (the SellerProfile that
-- owns the StoreDetails row) and is never stored as a StoreMember row.

CREATE TYPE "StoreMemberRole" AS ENUM ('MANAGER', 'STAFF', 'EDITOR');

CREATE TYPE "StoreMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED');

CREATE TABLE "store_members" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StoreMemberRole" NOT NULL,
    "status" "StoreMemberStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_members_pkey" PRIMARY KEY ("id")
);

-- One active/pending membership per (user, store). Soft-removed rows
-- keep history but the unique index only covers non-REMOVED so the
-- same user can be re-invited later.
CREATE UNIQUE INDEX "store_members_storeId_userId_active_key"
  ON "store_members" ("storeId", "userId")
  WHERE "status" IN ('PENDING', 'ACTIVE');

CREATE INDEX "store_members_storeId_status_idx" ON "store_members"("storeId", "status");
CREATE INDEX "store_members_userId_status_idx" ON "store_members"("userId", "status");

ALTER TABLE "store_members"
  ADD CONSTRAINT "store_members_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "store_details"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_members"
  ADD CONSTRAINT "store_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_members"
  ADD CONSTRAINT "store_members_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Required for store-members.service.ts auditLog calls.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'STORE_MEMBER_INVITED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'STORE_MEMBER_REMOVED';

