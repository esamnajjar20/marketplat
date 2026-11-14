-- Fix: 20261008030000_add_social_follows introduced the follow graph and the
-- NEW_FOLLOWER / FOLLOWED_* notification types in schema.prisma, but never
-- added the matching values to the Postgres "NotificationType" enum. Any
-- insert using them failed with SQLSTATE 22P02, which kept every
-- FOLLOWED_ACTIVITY_NOTIFICATION outbox event in an endless retry loop.
-- IF NOT EXISTS keeps this safe on databases patched by hand.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_FOLLOWER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOWED_USER_ACTIVITY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOWED_STORE_ACTIVITY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOWED_CATEGORY_ACTIVITY';
