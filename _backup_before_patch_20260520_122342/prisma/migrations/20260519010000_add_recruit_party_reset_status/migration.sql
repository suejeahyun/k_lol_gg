-- Keep admin full reset history instead of hard-deleting Kakao recruit records.
ALTER TYPE "RecruitPartyStatus" ADD VALUE IF NOT EXISTS 'RESET';
