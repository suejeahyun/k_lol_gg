-- CreateEnum
CREATE TYPE "EventNoticeType" AS ENUM ('EVENT_MATCH', 'DESTRUCTION', 'ETC');

-- CreateEnum
CREATE TYPE "EventNoticeStatus" AS ENUM ('PLANNED', 'RECRUITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "EventNotice" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "EventNoticeType" NOT NULL,
    "status" "EventNoticeStatus" NOT NULL DEFAULT 'RECRUITING',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventNotice_pkey" PRIMARY KEY ("id")
);
