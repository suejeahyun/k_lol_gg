CREATE TABLE "Highlight" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "youtubeUrl" TEXT NOT NULL,
  "youtubeId" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Highlight_isPublished_sortOrder_createdAt_idx"
ON "Highlight"("isPublished", "sortOrder", "createdAt");
