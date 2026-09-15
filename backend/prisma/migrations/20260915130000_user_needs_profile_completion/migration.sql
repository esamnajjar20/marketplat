-- FEAT-GOOGLE-COMPLETE-PROFILE: flags a User row (currently only ever
-- set true for brand-new Google Sign-In accounts, see schema.prisma's
-- comment on this column) as needing the /complete-profile step
-- before it's treated as fully onboarded.
ALTER TABLE "users" ADD COLUMN "needsProfileCompletion" BOOLEAN NOT NULL DEFAULT false;
