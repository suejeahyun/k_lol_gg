/*
  Warnings:

  - You are about to drop the column `endDate` on the `EventNotice` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `EventNotice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EventNotice" DROP COLUMN "endDate",
DROP COLUMN "status",
ADD COLUMN     "recruitInfo" TEXT,
ADD COLUMN     "rule" TEXT;

-- DropEnum
DROP TYPE "EventNoticeStatus";
