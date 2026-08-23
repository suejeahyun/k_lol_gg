-- A form request reserves a number briefly, but is not visible in public recruit status.
ALTER TYPE "RecruitPartyStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
