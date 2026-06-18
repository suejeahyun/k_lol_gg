-- K-LOL.GG 멸망전 경매 티어 연출 강제 테스트 helper
-- 사용법:
-- 1) 아래 target_nickname/target_tag 값을 원하는 테스트 대상에 맞게 수정
-- 2) 실행 후 /destruction-auction-live/<tournamentId> 에서 카드 추첨
--
-- 테스트 대상 목록:
-- 연출테스트아이언 TIER01
-- 연출테스트브론즈 TIER02
-- 연출테스트실버 TIER03
-- 연출테스트골드 TIER04
-- 연출테스트플래티넘 TIER05
-- 연출테스트에메랄드 TIER06
-- 연출테스트다이아 TIER07
-- 연출테스트마스터 TIER08
-- 연출테스트그랜드마스터 TIER09
-- 연출테스트챌린저 TIER10

BEGIN;

WITH config AS (
  SELECT
    '[TEST] 멸망전 경매 티어 연출 테스트'::text AS tournament_title,
    '연출테스트다이아'::text AS target_nickname,
    'TIER07'::text AS target_tag
),
tournament AS (
  SELECT dt.id
  FROM "DestructionTournament" dt
  JOIN config c ON c.tournament_title = dt.title
  LIMIT 1
),
reset_targets AS (
  UPDATE "DestructionParticipant" dp
  SET
    "auctionStatus" = 'HOLD'::"DestructionAuctionStatus",
    "teamId" = NULL,
    "purchasePoint" = NULL,
    "drawOrder" = NULL,
    "soldAt" = NULL
  FROM tournament t
  WHERE dp."tournamentId" = t.id
    AND dp."isCaptain" = false
  RETURNING dp.id
),
set_target AS (
  UPDATE "DestructionParticipant" dp
  SET
    "auctionStatus" = 'PENDING'::"DestructionAuctionStatus",
    "teamId" = NULL,
    "purchasePoint" = NULL,
    "drawOrder" = NULL,
    "soldAt" = NULL
  FROM tournament t, config c, "Player" p
  WHERE dp."tournamentId" = t.id
    AND dp."playerId" = p.id
    AND p.nickname = c.target_nickname
    AND p.tag = c.target_tag
  RETURNING dp.id, dp."tournamentId"
)
SELECT
  st."tournamentId",
  '/destruction-auction-live/' || st."tournamentId" AS "liveUrl",
  'NEXT TARGET READY' AS status
FROM set_target st;

COMMIT;
