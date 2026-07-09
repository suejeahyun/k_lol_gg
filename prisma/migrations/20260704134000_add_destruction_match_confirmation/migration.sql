-- Existing matches are treated as already confirmed so current 운영 경기 입력 흐름이 잠기지 않습니다.
ALTER TABLE "DestructionMatch" ADD COLUMN "isConfirmed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DestructionMatch" ALTER COLUMN "isConfirmed" SET DEFAULT false;
