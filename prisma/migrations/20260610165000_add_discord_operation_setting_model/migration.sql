CREATE TABLE IF NOT EXISTS "DiscordOperationSetting" (
    "id" SERIAL PRIMARY KEY,
    "key" TEXT NOT NULL UNIQUE,
    "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "description" TEXT,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "DiscordOperationSetting_updatedAt_idx" ON "DiscordOperationSetting"("updatedAt");
