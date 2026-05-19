-- Production safety migration.
-- Some databases may have the Prisma migration marked as applied while the PostgreSQL enum value is still missing.
ALTER TYPE "RecruitPartyStatus" ADD VALUE IF NOT EXISTS 'RESET';
