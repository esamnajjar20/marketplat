-- CreateEnum
CREATE TYPE "UserActivityType" AS ENUM (
    'AD_CREATED',
    'AD_UPDATED',
    'AD_DELETED',
    'PRODUCT_CREATED',
    'PRODUCT_UPDATED',
    'PRODUCT_DELETED',
    'SERVICE_CREATED',
    'SERVICE_UPDATED',
    'SERVICE_DELETED',
    'STORE_CREATED',
    'STORE_UPDATED',
    'FAVORITE_ADDED',
    'FAVORITE_REMOVED',
    'STORE_FOLLOWED',
    'STORE_UNFOLLOWED',
    'MESSAGE_SENT',
    'SERVICE_REQUEST_CREATED',
    'SERVICE_REQUEST_STATUS_CHANGED',
    'APPOINTMENT_BOOKED',
    'APPOINTMENT_CANCELLED',
    'PROFILE_UPDATED',
    'PASSWORD_CHANGED'
);

-- CreateTable
CREATE TABLE "user_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "UserActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Serves both "my timeline, newest first" (uses the userId+type leading
-- columns' left prefix, i.e. just userId, then sorts on createdAt) and
-- "my timeline filtered to one type, newest first" — see the model's
-- own doc comment in schema.prisma for why no separate [userId,
-- createdAt]-only index is needed alongside this one.
CREATE INDEX "user_activities_userId_type_createdAt_idx" ON "user_activities"("userId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "user_activities" ADD CONSTRAINT "user_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
