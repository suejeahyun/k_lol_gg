/*
  Warnings:

  - You are about to drop the column `type` on the `AdminLog` table. All the data in the column will be lost.
  - Added the required column `action` to the `AdminLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdminLog" DROP COLUMN "type",
ADD COLUMN     "action" TEXT NOT NULL;
