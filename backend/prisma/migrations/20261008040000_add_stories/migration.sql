CREATE TYPE "StoryVisibility" AS ENUM ('PUBLIC', 'FOLLOWERS');

CREATE TABLE "stories" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "mediaPublicId" TEXT,
  "text" VARCHAR(500),
  "background" VARCHAR(40),
  "visibility" "StoryVisibility" NOT NULL DEFAULT 'FOLLOWERS',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "story_views" (
  "id" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "story_views_storyId_viewerId_key" ON "story_views"("storyId", "viewerId");
CREATE INDEX "stories_userId_expiresAt_createdAt_idx" ON "stories"("userId", "expiresAt", "createdAt");
CREATE INDEX "stories_expiresAt_idx" ON "stories"("expiresAt");
CREATE INDEX "story_views_storyId_viewedAt_idx" ON "story_views"("storyId", "viewedAt");
CREATE INDEX "story_views_viewerId_viewedAt_idx" ON "story_views"("viewerId", "viewedAt");

ALTER TABLE "stories" ADD CONSTRAINT "stories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
