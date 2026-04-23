/*
  Warnings:

  - The `imageUrl` column on the `GalleryImage` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "GalleryImage" DROP COLUMN "imageUrl",
ADD COLUMN     "imageUrl" TEXT[];
