-- K-LOL.GG 멸망전 경매 티어 연출 테스트 데이터
-- 목적: 아이언/브론즈/실버/골드, 플래티넘/에메랄드/다이아, 마스터/그랜드마스터/챌린저 연출을 한 번에 테스트
-- 생성 후 확인 주소: /destruction-auction-live/<생성된 tournament id>

BEGIN;

DELETE FROM "DestructionTournament"
WHERE title = '[TEST] 멸망전 경매 티어 연출 테스트';

WITH player_seed(name, nickname, tag, current_tier, peak_tier) AS (
  VALUES
    ('재현', '연출테스트캡틴01', 'CAP01', '다이아 4', '마스터 0LP'),
    ('민수', '연출테스트캡틴02', 'CAP02', '에메랄드 2', '다이아 4'),
    ('도윤', '연출테스트캡틴03', 'CAP03', '플래티넘 1', '에메랄드 4'),
    ('지훈', '연출테스트캡틴04', 'CAP04', '골드 1', '플래티넘 3'),
    ('서준', '연출테스트캡틴05', 'CAP05', '에메랄드 3', '다이아 4'),
    ('현우', '연출테스트캡틴06', 'CAP06', '다이아 3', '다이아 1'),

    ('강철', '연출테스트아이언', 'TIER01', '아이언 1', '브론즈 4'),
    ('동수', '연출테스트브론즈', 'TIER02', '브론즈 2', '실버 4'),
    ('은호', '연출테스트실버', 'TIER03', '실버 1', '골드 4'),
    ('금찬', '연출테스트골드', 'TIER04', '골드 2', '플래티넘 4'),
    ('플태', '연출테스트플래티넘', 'TIER05', '플래티넘 2', '에메랄드 4'),
    ('에머', '연출테스트에메랄드', 'TIER06', '에메랄드 2', '다이아 4'),
    ('다현', '연출테스트다이아', 'TIER07', '다이아 2', '다이아 1'),
    ('마준', '연출테스트마스터', 'TIER08', '마스터 0LP', '마스터 100LP'),
    ('그준', '연출테스트그랜드마스터', 'TIER09', '그랜드마스터 300LP', '그랜드마스터 500LP'),
    ('챌호', '연출테스트챌린저', 'TIER10', '챌린저 700LP', '챌린저 900LP')
),
upsert_players AS (
  INSERT INTO "Player" (name, nickname, tag, "currentTier", "peakTier", "isActive", "createdAt")
  SELECT name, nickname, tag, current_tier, peak_tier, true, NOW()
  FROM player_seed
  ON CONFLICT (nickname, tag)
  DO UPDATE SET
    name = EXCLUDED.name,
    "currentTier" = EXCLUDED."currentTier",
    "peakTier" = EXCLUDED."peakTier",
    "isActive" = true,
    "deactivatedAt" = NULL
  RETURNING id, name, nickname, tag
),
tournament AS (
  INSERT INTO "DestructionTournament" (
    title,
    description,
    status,
    "preliminaryFormat",
    "preliminaryBestOf",
    "preliminaryRoundCount",
    "advanceTeamCount",
    "startDate"
  )
  VALUES (
    '[TEST] 멸망전 경매 티어 연출 테스트',
    '경매 카드 연출/효과음 테스트용 데이터입니다. 골드 이하, 플레~다이아, 마스터 이상 연출 확인용입니다.',
    'AUCTION'::"DestructionStatus",
    'FULL_ROUND_ROBIN_BO1'::"DestructionPreliminaryFormat",
    1,
    1,
    4,
    NOW()
  )
  RETURNING id
),
team_seed(team_name, captain_nickname, captain_tag, captain_position) AS (
  VALUES
    ('재현팀', '연출테스트캡틴01', 'CAP01', 'TOP'),
    ('민수팀', '연출테스트캡틴02', 'CAP02', 'JGL'),
    ('도윤팀', '연출테스트캡틴03', 'CAP03', 'MID'),
    ('지훈팀', '연출테스트캡틴04', 'CAP04', 'ADC'),
    ('서준팀', '연출테스트캡틴05', 'CAP05', 'SUP'),
    ('현우팀', '연출테스트캡틴06', 'CAP06', 'TOP')
),
inserted_teams AS (
  INSERT INTO "DestructionTeam" (
    "tournamentId",
    name,
    "captainId",
    points,
    wins,
    losses,
    "initialAuctionPoints",
    "remainingAuctionPoints"
  )
  SELECT
    t.id,
    ts.team_name,
    p.id,
    0,
    0,
    0,
    100,
    100
  FROM tournament t
  JOIN team_seed ts ON true
  JOIN upsert_players p ON p.nickname = ts.captain_nickname AND p.tag = ts.captain_tag
  RETURNING id, "tournamentId", name, "captainId"
),
insert_captains AS (
  INSERT INTO "DestructionParticipant" (
    "tournamentId",
    "teamId",
    "playerId",
    position,
    "balanceScore",
    "isCaptain",
    "auctionStatus",
    "purchasePoint",
    "drawOrder",
    "soldAt"
  )
  SELECT
    it."tournamentId",
    it.id,
    it."captainId",
    ts.captain_position::"Position",
    100,
    true,
    'ASSIGNED'::"DestructionAuctionStatus",
    0,
    NULL,
    NOW()
  FROM inserted_teams it
  JOIN team_seed ts ON ts.team_name = it.name
  RETURNING id
),
auction_seed(name, nickname, tag, position, score) AS (
  VALUES
    ('강철', '연출테스트아이언', 'TIER01', 'TOP', 10.0),
    ('동수', '연출테스트브론즈', 'TIER02', 'JGL', 20.0),
    ('은호', '연출테스트실버', 'TIER03', 'MID', 30.0),
    ('금찬', '연출테스트골드', 'TIER04', 'ADC', 40.0),
    ('플태', '연출테스트플래티넘', 'TIER05', 'SUP', 50.0),
    ('에머', '연출테스트에메랄드', 'TIER06', 'TOP', 60.0),
    ('다현', '연출테스트다이아', 'TIER07', 'JGL', 70.0),
    ('마준', '연출테스트마스터', 'TIER08', 'MID', 80.0),
    ('그준', '연출테스트그랜드마스터', 'TIER09', 'ADC', 90.0),
    ('챌호', '연출테스트챌린저', 'TIER10', 'SUP', 100.0)
),
insert_auction_targets AS (
  INSERT INTO "DestructionParticipant" (
    "tournamentId",
    "teamId",
    "playerId",
    position,
    "balanceScore",
    "isCaptain",
    "auctionStatus",
    "purchasePoint",
    "drawOrder",
    "soldAt"
  )
  SELECT
    t.id,
    NULL,
    p.id,
    a.position::"Position",
    a.score,
    false,
    'PENDING'::"DestructionAuctionStatus",
    NULL,
    NULL,
    NULL
  FROM tournament t
  JOIN auction_seed a ON true
  JOIN upsert_players p ON p.nickname = a.nickname AND p.tag = a.tag
  RETURNING id
)
SELECT
  t.id AS "tournamentId",
  '/destruction-auction-live/' || t.id AS "liveUrl",
  '/admin/progress/destruction/' || t.id || '?step=AUCTION' AS "adminUrl"
FROM tournament t;

COMMIT;

-- 특정 티어 하나만 다음 추첨에 나오게 하고 싶으면 아래 helper SQL 파일을 사용하세요.
-- prisma/test-destruction-auction-force-next-tier.sql
