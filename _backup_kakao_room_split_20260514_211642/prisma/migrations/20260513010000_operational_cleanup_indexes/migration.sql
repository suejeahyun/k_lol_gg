-- Operational cleanup indexes for search, active-player lists, and gallery home display.
CREATE INDEX IF NOT EXISTS "Player_isActive_createdAt_idx" ON "Player"("isActive", "createdAt");
CREATE INDEX IF NOT EXISTS "Player_name_idx" ON "Player"("name");
CREATE INDEX IF NOT EXISTS "Player_nickname_idx" ON "Player"("nickname");
CREATE INDEX IF NOT EXISTS "Player_tag_idx" ON "Player"("tag");
CREATE INDEX IF NOT EXISTS "GalleryImage_showOnHome_createdAt_idx" ON "GalleryImage"("showOnHome", "createdAt");

-- DB-level safety: only one gallery image can be exposed on home at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS "GalleryImage_only_one_home_true_idx"
ON "GalleryImage"("showOnHome")
WHERE "showOnHome" = true;
