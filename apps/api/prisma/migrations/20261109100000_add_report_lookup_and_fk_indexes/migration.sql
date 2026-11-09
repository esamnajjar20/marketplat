-- Additive, online indexes for two existing Report access paths.
-- No table rewrite, row update, or existing index/constraint removal.
-- CONCURRENTLY avoids holding a write-blocking table lock for the full build.
CREATE INDEX CONCURRENTLY "reports_userId_createdAt_id_idx"
  ON "reports" ("userId", "createdAt", "id");

CREATE INDEX CONCURRENTLY "reports_adId_idx"
  ON "reports" ("adId");
