-- STORE-FOLLOWER-NOTIFICATIONS (Foundation v1): two new notification
-- types, both fanned out to every follower of a store (not the store
-- owner) — see schema.prisma's NotificationType doc comments on each
-- value for the exact trigger and audience.
ALTER TYPE "NotificationType" ADD VALUE 'STORE_PROMOTION_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'STORE_PRODUCT_RESTOCKED';
