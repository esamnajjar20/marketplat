-- Soft-delete support for Message: keep the row so the other party's
-- thread still renders a placeholder instead of a gap; body is left
-- intact and every read path must stop returning it once deletedAt is set.
ALTER TABLE "messages" ADD COLUMN "deletedAt" TIMESTAMP(3);
