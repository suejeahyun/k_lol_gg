-- Keep finished recruit parties as operation history instead of hard deleting them.
-- This preserves members and prevents recruitment-number history from disappearing after 마무리.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'RecruitPartyStatus'
      AND e.enumlabel = 'FINISHED'
  ) THEN
    ALTER TYPE "RecruitPartyStatus" ADD VALUE 'FINISHED' AFTER 'IN_PROGRESS';
  END IF;
END $$;
