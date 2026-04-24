/*
  Warnings:

  - You are about to drop the column `action` on the `AdminLog` table. All the data in the column will be lost.
  - You are about to drop the column `target` on the `AdminLog` table. All the data in the column will be lost.
  - Added the required column `message` to the `AdminLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `AdminLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdminLog" DROP COLUMN "action",
DROP COLUMN "target",
ADD COLUMN     "message" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL;
