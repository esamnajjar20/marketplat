-- Gap #20: admin permission tiers — MODERATOR sits between USER and
-- ADMIN, SUPER_ADMIN sits above ADMIN. Existing USER/ADMIN rows are
-- unaffected; no data migration needed since we're only adding values.
ALTER TYPE "Role" ADD VALUE 'MODERATOR';
ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';
