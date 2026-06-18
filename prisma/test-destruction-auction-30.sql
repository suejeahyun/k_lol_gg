-- K-LOL.GG 멸망전 경매 테스트 데이터 초기화 + 30명 참가자 생성
-- 목적: 기존 [TEST] 멸망전 경매 데이터와 멸망테스트 참가자만 삭제 후 30명/6팀 경매 테스트 데이터 생성
-- 실행: npx prisma db execute --file prisma/test-destruction-auction-30.sql --schema prisma/schema.prisma

BEGIN;

-- 1) 기존 테스트 멸망전 삭제
-- DestructionTournament 관계는 onDelete Cascade 설정이므로 관련 팀/참가자/경기/신청이 함께 삭제됩니다.
DELETE FROM "DestructionTournament"
WHERE "title" LIKE '[TEST] 멸망전 경매%';

-- 2) 기존 테스트 플레이어 삭제
-- 실제 운영 플레이어를 삭제하지 않기 위해 nickname 접두어와 tag 패턴을 모두 제한합니다.
DELETE FROM "Player"
WHERE "nickname" LIKE '멸망테스트%'
  AND "tag" LIKE 'T%';

-- 3) 30명 테스트 참가자 + 6팀 + 경매 참가 상태 생성
DO $$
DECLARE
  v_tournament_id INT;
  v_player_id INT;
  v_team_id INT;
  v_player_ids INT[] := ARRAY[]::INT[];
  v_i INT;
  v_positions TEXT[] := ARRAY[
    'TOP','JGL','MID','ADC','SUP','TOP',
    'TOP','TOP','TOP','TOP',
    'JGL','JGL','JGL','JGL','JGL',
    'MID','MID','MID','MID','MID',
    'ADC','ADC','ADC','ADC','ADC',
    'SUP','SUP','SUP','SUP','SUP'
  ];
  v_names TEXT[] := ARRAY[
    '재현','민수','도윤','지훈','서준','현우',
    '태민','준호','성민','건우','유찬','민재','시우','하준','도현',
    '지우','윤호','승민','준서','정우','현식','대중','소현','유진','민호',
    '수빈','예준','동현','상민','준혁'
  ];
  v_current_tiers TEXT[] := ARRAY[
    '다이아 3','플래티넘 1','에메랄드 2','다이아 4','플래티넘 2','마스터 1층',
    '에메랄드 4','골드 1','플래티넘 3','다이아 2','실버 1','골드 2','에메랄드 3','플래티넘 4','골드 3',
    '다이아 4','에메랄드 1','플래티넘 2','골드 1','실버 2','에메랄드 2','플래티넘 1','다이아 3','골드 2','플래티넘 4',
    '실버 1','골드 4','에메랄드 4','플래티넘 3','다이아 4'
  ];
  v_peak_tiers TEXT[] := ARRAY[
    '다이아 1','다이아 4','다이아 3','다이아 2','에메랄드 1','마스터 100점',
    '다이아 4','플래티넘 2','에메랄드 3','다이아 1','골드 1','플래티넘 1','에메랄드 1','다이아 4','플래티넘 3',
    '다이아 3','다이아 4','에메랄드 1','플래티넘 1','골드 1','다이아 4','다이아 3','다이아 2','플래티넘 2','에메랄드 2',
    '골드 2','플래티넘 4','에메랄드 2','에메랄드 4','다이아 3'
  ];
  v_scores FLOAT8[] := ARRAY[
    78,72,70,76,69,86,
    66,58,63,80,50,56,65,61,54,
    75,68,62,57,49,67,71,79,55,60,
    48,53,64,59,74
  ];
  v_team_names TEXT[] := ARRAY[
    '재현팀','민수팀','도윤팀','지훈팀','서준팀','현우팀'
  ];
BEGIN
  INSERT INTO "DestructionTournament" (
    "title",
    "description",
    "status",
    "startDate",
    "endDate",
    "preliminaryFormat",
    "preliminaryBestOf",
    "preliminaryRoundCount",
    "advanceTeamCount",
    "createdAt",
    "updatedAt"
  ) VALUES (
    '[TEST] 멸망전 경매 30명',
    '경매 카드뽑기/낙찰/보류 테스트용 데이터입니다. 운영 데이터가 아닙니다.',
    'AUCTION'::"DestructionStatus",
    NOW(),
    NULL,
    'FULL_ROUND_ROBIN_BO1'::"DestructionPreliminaryFormat",
    1,
    1,
    4,
    NOW(),
    NOW()
  )
  RETURNING "id" INTO v_tournament_id;

  FOR v_i IN 1..30 LOOP
    INSERT INTO "Player" (
      "name",
      "nickname",
      "tag",
      "currentTier",
      "peakTier",
      "balanceOverrideScore",
      "balanceOverrideReason",
      "isActive",
      "createdAt"
    ) VALUES (
      v_names[v_i],
      '멸망테스트' || LPAD(v_i::TEXT, 2, '0'),
      'T' || LPAD(v_i::TEXT, 3, '0'),
      v_current_tiers[v_i],
      v_peak_tiers[v_i],
      v_scores[v_i],
      '멸망전 경매 테스트 데이터',
      TRUE,
      NOW()
    )
    RETURNING "id" INTO v_player_id;

    v_player_ids := ARRAY_APPEND(v_player_ids, v_player_id);

    INSERT INTO "DestructionParticipationApply" (
      "tournamentId",
      "playerId",
      "mainPosition",
      "subPositions",
      "isCaptain",
      "status",
      "createdAt",
      "updatedAt"
    ) VALUES (
      v_tournament_id,
      v_player_id,
      v_positions[v_i]::"ApplyPosition",
      ARRAY[]::"ApplyPosition"[],
      v_i <= 6,
      'CONFIRMED'::"ParticipationApplyStatus",
      NOW(),
      NOW()
    );
  END LOOP;

  -- 4) 6명 팀장 생성. 각 팀은 100P로 시작합니다.
  FOR v_i IN 1..6 LOOP
    INSERT INTO "DestructionTeam" (
      "tournamentId",
      "name",
      "captainId",
      "points",
      "wins",
      "losses",
      "initialAuctionPoints",
      "remainingAuctionPoints"
    ) VALUES (
      v_tournament_id,
      v_team_names[v_i],
      v_player_ids[v_i],
      0,
      0,
      0,
      100,
      100
    )
    RETURNING "id" INTO v_team_id;

    INSERT INTO "DestructionParticipant" (
      "tournamentId",
      "teamId",
      "playerId",
      "position",
      "balanceScore",
      "isCaptain",
      "auctionStatus",
      "purchasePoint",
      "drawOrder",
      "soldAt"
    ) VALUES (
      v_tournament_id,
      v_team_id,
      v_player_ids[v_i],
      v_positions[v_i]::"Position",
      v_scores[v_i],
      TRUE,
      'ASSIGNED'::"DestructionAuctionStatus",
      0,
      NULL,
      NOW()
    );
  END LOOP;

  -- 5) 나머지 24명은 경매 추첨 대기 상태로 생성합니다.
  FOR v_i IN 7..30 LOOP
    INSERT INTO "DestructionParticipant" (
      "tournamentId",
      "teamId",
      "playerId",
      "position",
      "balanceScore",
      "isCaptain",
      "auctionStatus",
      "purchasePoint",
      "drawOrder",
      "soldAt"
    ) VALUES (
      v_tournament_id,
      NULL,
      v_player_ids[v_i],
      v_positions[v_i]::"Position",
      v_scores[v_i],
      FALSE,
      'PENDING'::"DestructionAuctionStatus",
      NULL,
      NULL,
      NULL
    );
  END LOOP;

  INSERT INTO "AdminLog" ("action", "message", "targetType", "targetId", "createdAt")
  VALUES (
    'DESTRUCTION_TEST_SEED_30',
    '[TEST] 멸망전 경매 30명 테스트 데이터 생성 완료',
    'DestructionTournament',
    v_tournament_id,
    NOW()
  );

  RAISE NOTICE 'Created test destruction tournament id: %, participants: 30, teams: 6', v_tournament_id;
END $$;

COMMIT;

-- 생성 결과 확인용
SELECT
  t."id" AS "tournamentId",
  t."title",
  t."status",
  COUNT(DISTINCT p."id") AS "participants",
  COUNT(DISTINCT tm."id") AS "teams",
  COUNT(DISTINCT CASE WHEN p."isCaptain" THEN p."id" END) AS "captains",
  COUNT(DISTINCT CASE WHEN NOT p."isCaptain" AND p."auctionStatus" = 'PENDING' THEN p."id" END) AS "pendingAuction"
FROM "DestructionTournament" t
LEFT JOIN "DestructionParticipant" p ON p."tournamentId" = t."id"
LEFT JOIN "DestructionTeam" tm ON tm."tournamentId" = t."id"
WHERE t."title" = '[TEST] 멸망전 경매 30명'
GROUP BY t."id", t."title", t."status";
