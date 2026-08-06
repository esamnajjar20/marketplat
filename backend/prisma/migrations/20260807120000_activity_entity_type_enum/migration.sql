-- Gap #10 follow-up (audit finding 5.4): UserActivity.entityType was a
-- free-form TEXT column, with the 7 valid tags ('AD' | 'PRODUCT' |
-- 'SERVICE_LISTING' | 'STORE' | 'CONVERSATION' | 'SERVICE_REQUEST' |
-- 'APPOINTMENT') documented only in a schema.prisma comment. A typo in
-- the one writer (activity.templates.ts) would have compiled and
-- inserted silently. This migration promotes it to a real enum.
--
-- Every existing row's entityType value (if any) already matches one
-- of these 7 tags exactly — activity.templates.ts is the only writer
-- and it has only ever used these literals — so the USING cast is a
-- straight, lossless conversion, not a backfill.

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM (
    'AD',
    'PRODUCT',
    'SERVICE_LISTING',
    'STORE',
    'CONVERSATION',
    'SERVICE_REQUEST',
    'APPOINTMENT'
);

-- AlterTable
ALTER TABLE "user_activities"
    ALTER COLUMN "entityType" TYPE "ActivityEntityType"
    USING ("entityType"::"ActivityEntityType");
