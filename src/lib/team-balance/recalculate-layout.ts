import { PrismaClient, type Position, type Prisma, type Team } from "@prisma/client";
import { getMmrBonus, getPositionMmrValue } from "@/lib/balance/internal-mmr";
import { evaluateBalanceLayout, type BalanceEvaluatePlayer } from "@/lib/balance/ai-evaluation";
import {
  getResolvedTeamBalanceTierScore,
  getTeamBalanceBaseScore,
  getTeamBalanceInhouseScore,
  getTeamBalanceRolePenalty,
  getTeamBalanceRoleType,
  TEAM_BALANCE_POSITIONS,
  type TeamBalanceRoleType,
} from "@/lib/team-balance/scoring";

export type ManualLayoutAssignmentInput = {
  playerId: number;
  team: Team;
  position: Position;
  mainPositions?: Position[] | null;
  subPositions?: Position[] | null;
};

type Db = Prisma.TransactionClient | PrismaClient;

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function isPosition(value: unknown): value is Position {
  return typeof value === "string" && TEAM_BALANCE_POSITIONS.includes(value as Position);
}

function isTeam(value: unknown): value is Team {
  return value === "RED" || value === "BLUE";
}

function getSoloRecentFormBonus(player: {
  soloRecentGames: number;
  soloRecentWinRate: number | null;
  soloRecentKda: number | null;
  soloRecentAvgDamage: number | null;
  soloRecentAvgVisionScore: number | null;
}) {
  if (player.soloRecentGames <= 0) return 0;
  const reliability = Math.min(1, player.soloRecentGames / 20);
  const winRateBonus =
    typeof player.soloRecentWinRate === "number"
      ? Math.max(-2, Math.min(2, (player.soloRecentWinRate - 50) / 12.5))
      : 0;
  const kdaBonus =
    typeof player.soloRecentKda === "number"
      ? Math.max(-1.5, Math.min(1.5, (player.soloRecentKda - 2.5) / 1.25))
      : 0;
  const damageBonus =
    typeof player.soloRecentAvgDamage === "number"
      ? Math.max(-1, Math.min(1, (player.soloRecentAvgDamage - 18000) / 7000))
      : 0;
  const visionBonus =
    typeof player.soloRecentAvgVisionScore === "number"
      ? Math.max(-0.5, Math.min(0.5, (player.soloRecentAvgVisionScore - 20) / 20))
      : 0;

  return round(Math.max(-5, Math.min(5, (winRateBonus + kdaBonus + damageBonus + visionBonus) * reliability)));
}

function getPositionSkillBonus(params: {
  playerId: number;
  position: Position;
  mainPositions: Position[];
  subPositions: Position[];
  soloRecentGames: number;
  soloRecentMainPosition: Position | null;
  soloRecentSubPosition: Position | null;
  soloRecentPositionConfidence: number;
  internalPositionCountByKey: Map<string, number>;
}) {
  const internalCount = params.internalPositionCountByKey.get(`${params.playerId}:${params.position}`) ?? 0;
  const internalPositionBonus = internalCount >= 10 ? 2 : internalCount >= 6 ? 1.4 : internalCount >= 3 ? 0.8 : 0;

  let soloPositionBonus = 0;
  if (params.soloRecentMainPosition === params.position) soloPositionBonus = 2;
  else if (params.soloRecentSubPosition === params.position) soloPositionBonus = 1;

  let soloApplyPositionMatchBonus = 0;
  if (params.soloRecentGames >= 10 && params.mainPositions.includes(params.position)) {
    soloApplyPositionMatchBonus += 1.5 * params.soloRecentPositionConfidence;
  }
  if (params.soloRecentGames >= 10 && !params.subPositions.includes(params.position) && !params.mainPositions.includes(params.position)) {
    soloApplyPositionMatchBonus -= 1.2;
  }

  const positionSkillBonus = round(Math.max(-3, Math.min(3, internalPositionBonus + soloPositionBonus + soloApplyPositionMatchBonus)));

  return {
    internalPositionBonus: round(internalPositionBonus),
    soloPositionBonus: round(soloPositionBonus),
    soloApplyPositionMatchBonus: round(soloApplyPositionMatchBonus),
    positionSkillBonus,
  };
}

export function validateManualLayoutAssignments(assignments: ManualLayoutAssignmentInput[]) {
  if (!Array.isArray(assignments) || assignments.length !== 10) {
    return "수동 재계산할 팀 배치는 정확히 10명이어야 합니다.";
  }

  const playerIds = assignments.map((item) => item.playerId);
  if (playerIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return "수동 재계산할 플레이어 ID가 올바르지 않습니다.";
  }
  if (new Set(playerIds).size !== playerIds.length) {
    return "수동 재계산 배치에 중복 플레이어가 있습니다.";
  }

  for (const team of ["RED", "BLUE"] as Team[]) {
    const teamItems = assignments.filter((item) => item.team === team);
    if (teamItems.length !== 5) return `${team} 팀은 정확히 5명이어야 합니다.`;
    const positions = new Set(teamItems.map((item) => item.position));
    if (positions.size !== 5) return `${team} 팀 포지션이 중복되었습니다.`;
  }

  if (assignments.some((item) => !isTeam(item.team) || !isPosition(item.position))) {
    return "팀 또는 포지션 값이 올바르지 않습니다.";
  }

  return null;
}

export async function recalculateManualTeamBalanceLayout(db: Db, assignments: ManualLayoutAssignmentInput[]) {
  const validationError = validateManualLayoutAssignments(assignments);
  if (validationError) {
    throw new Error(validationError);
  }

  const playerIds = assignments.map((item) => item.playerId);
  const activeSeason = await db.season.findFirst({ where: { isActive: true }, select: { id: true } });

  const [players, recentSoloMatches, internalParticipants, playerSeasonStats] = await Promise.all([
    db.player.findMany({
      where: { id: { in: playerIds }, isActive: true },
      select: {
        id: true,
        name: true,
        nickname: true,
        tag: true,
        currentTier: true,
        peakTier: true,
        balanceOverrideScore: true,
        balanceOverrideReason: true,
        balanceProfile: true,
      },
    }),
    db.playerSoloMatch.findMany({
      where: { playerId: { in: playerIds } },
      orderBy: { gameCreation: "desc" },
      take: playerIds.length * 20,
      select: {
        playerId: true,
        position: true,
        kills: true,
        deaths: true,
        assists: true,
        win: true,
        totalDamageDealtToChampions: true,
        visionScore: true,
      },
    }),
    db.matchParticipant.findMany({
      where: { playerId: { in: playerIds } },
      select: { playerId: true, position: true },
    }),
    activeSeason
      ? db.playerSeasonStat.findMany({
          where: { seasonId: activeSeason.id, playerId: { in: playerIds } },
          select: { playerId: true, totalGames: true, participationCount: true, wins: true, losses: true, mvpCount: true },
        })
      : Promise.resolve([]),
  ]);

  if (players.length !== playerIds.length) {
    throw new Error("수동 재계산 대상 중 존재하지 않거나 비활성화된 플레이어가 있습니다.");
  }

  const playerById = new Map(players.map((player) => [player.id, player]));
  const seasonStatByPlayerId = new Map(playerSeasonStats.map((stat) => [stat.playerId, stat]));
  const internalPositionCountByKey = new Map<string, number>();
  internalParticipants.forEach((participant) => {
    const key = `${participant.playerId}:${participant.position}`;
    internalPositionCountByKey.set(key, (internalPositionCountByKey.get(key) ?? 0) + 1);
  });

  const recentCountByPlayerId = new Map<number, number>();
  const recentStatsByPlayerId = new Map<number, {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    vision: number;
    positionCounts: Map<Position, number>;
  }>();

  recentSoloMatches.forEach((match) => {
    const current = recentCountByPlayerId.get(match.playerId) ?? 0;
    if (current >= 20) return;
    recentCountByPlayerId.set(match.playerId, current + 1);
    const stat = recentStatsByPlayerId.get(match.playerId) ?? {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      damage: 0,
      vision: 0,
      positionCounts: new Map<Position, number>(),
    };
    stat.games += 1;
    stat.wins += match.win ? 1 : 0;
    stat.kills += match.kills;
    stat.deaths += match.deaths;
    stat.assists += match.assists;
    stat.damage += match.totalDamageDealtToChampions;
    stat.vision += match.visionScore;
    if (isPosition(match.position)) {
      stat.positionCounts.set(match.position, (stat.positionCounts.get(match.position) ?? 0) + 1);
    }
    recentStatsByPlayerId.set(match.playerId, stat);
  });

  const resolved = assignments.map((assignment) => {
    const player = playerById.get(assignment.playerId)!;
    const mainPositions = (assignment.mainPositions ?? []).filter(isPosition);
    const subPositions = (assignment.subPositions ?? []).filter(isPosition).filter((position) => !mainPositions.includes(position));
    const inhouseScore = getTeamBalanceInhouseScore(seasonStatByPlayerId.get(player.id));
    const base = getTeamBalanceBaseScore({ currentTier: player.currentTier, peakTier: player.peakTier, inhouseScore });
    const roleType = getTeamBalanceRoleType({ position: assignment.position, mainPositions, subPositions });
    const rolePenalty = getTeamBalanceRolePenalty({ roleType, currentTier: player.currentTier, peakTier: player.peakTier });
    const recent = recentStatsByPlayerId.get(player.id);
    const soloRecentGames = recent?.games ?? 0;
    const soloRecentWins = recent?.wins ?? 0;
    const sortedSoloPositions = recent ? [...recent.positionCounts.entries()].sort((a, b) => b[1] - a[1]) : [];
    const soloRecentMainPosition = sortedSoloPositions[0] && sortedSoloPositions[0][1] >= 5 ? sortedSoloPositions[0][0] : null;
    const soloRecentSubPosition = sortedSoloPositions[1] && sortedSoloPositions[1][1] >= 3 ? sortedSoloPositions[1][0] : null;
    const soloRecentPositionConfidence = soloRecentGames > 0 && sortedSoloPositions[0]
      ? round(sortedSoloPositions[0][1] / soloRecentGames)
      : 0;
    const soloRecentKda = recent ? round((recent.kills + recent.assists) / Math.max(1, recent.deaths)) : null;
    const soloRecentAvgDamage = recent && soloRecentGames > 0 ? round(recent.damage / soloRecentGames, 0) : null;
    const soloRecentAvgVisionScore = recent && soloRecentGames > 0 ? round(recent.vision / soloRecentGames, 1) : null;
    const soloRecentWinRate = soloRecentGames > 0 ? round((soloRecentWins / soloRecentGames) * 100, 1) : null;
    const soloRecentFormBonus = getSoloRecentFormBonus({ soloRecentGames, soloRecentWinRate, soloRecentKda, soloRecentAvgDamage, soloRecentAvgVisionScore });
    const positionSkill = getPositionSkillBonus({
      playerId: player.id,
      position: assignment.position,
      mainPositions,
      subPositions,
      soloRecentGames,
      soloRecentMainPosition,
      soloRecentSubPosition,
      soloRecentPositionConfidence,
      internalPositionCountByKey,
    });
    const assignedPositionMmr = getPositionMmrValue(player.balanceProfile, assignment.position);
    const mmrBonus = getMmrBonus({
      overallMmr: player.balanceProfile?.overallMmr ?? 50,
      positionMmr: assignedPositionMmr,
      confidence: player.balanceProfile?.confidence ?? 0,
    });
    const balanceOverrideScore = player.balanceOverrideScore ?? 0;
    const score = round(Math.max(0, base.finalBaseScore + soloRecentFormBonus + positionSkill.positionSkillBonus + mmrBonus + balanceOverrideScore - rolePenalty));
    const tierDetail = getResolvedTeamBalanceTierScore(player.currentTier || "", player.peakTier || "");

    return {
      playerId: player.id,
      name: player.name,
      nickname: player.nickname,
      tag: player.tag,
      team: assignment.team,
      position: assignment.position,
      roleType,
      score,
      peakTier: player.peakTier ?? "",
      currentTier: player.currentTier ?? "",
      tierLabel: player.currentTier || player.peakTier || "티어 미등록",
      winRate: 0,
      inhouseScore,
      adjustedScore: base.adjustedScore,
      rankScore: base.finalBaseScore,
      rankBaseScore: base.finalBaseScore,
      rankAddedScore: 0,
      rankGapFromLowest: 0,
      tierWeight: 1,
      internalRankWeight: 0,
      mixedBaseScore: base.finalBaseScore,
      bonus: 0,
      finalBaseScore: base.finalBaseScore,
      balanceOverrideScore,
      balanceOverrideReason: player.balanceOverrideReason,
      balanceMmr: player.balanceProfile?.overallMmr ?? 50,
      assignedPositionMmr,
      mmrConfidence: player.balanceProfile?.confidence ?? 0,
      soloRecentGames,
      soloRecentWins,
      soloRecentWinRate,
      soloRecentKda,
      soloRecentMainPosition,
      soloRecentSubPosition,
      soloRecentPositionConfidence,
      soloRecentAvgDamage,
      soloRecentAvgVisionScore,
      mainPositions,
      subPositions,
      currentTierScore: tierDetail.currentTierScore,
      peakTierScore: tierDetail.peakTierScore,
      baseTierScore: base.adjustedScore,
      rolePenalty,
      soloRecentFormBonus,
      ...positionSkill,
      mmrBonus,
      scoreBreakdown: {
        currentTierScore: tierDetail.currentTierScore,
        peakTierScore: tierDetail.peakTierScore,
        inhouseScore,
        tierBaseScore: base.adjustedScore,
        adjustedScore: base.adjustedScore,
        internalRankBaseScore: base.finalBaseScore,
        rankGapFromLowest: 0,
        rankAddedScore: 0,
        rankScore: base.finalBaseScore,
        tierWeight: 1,
        internalRankWeight: 0,
        mixedBaseScore: base.finalBaseScore,
        sTierBonus: 0,
        finalBaseScore: base.finalBaseScore,
        roleMultiplier: 1,
        roleLoss: rolePenalty,
        rolePenalty,
        soloRecentFormBonus,
        soloApplyPositionMatchBonus: positionSkill.soloApplyPositionMatchBonus,
        internalPositionBonus: positionSkill.internalPositionBonus,
        soloPositionBonus: positionSkill.soloPositionBonus,
        positionSkillBonus: positionSkill.positionSkillBonus,
        mmrBonus,
        balanceOverrideScore,
        finalScore: score,
      },
      explanation: [
        `서버 재계산: 최고티어 ${tierDetail.peakTierScore.toFixed(1)}점 × 60% + 현재티어 ${tierDetail.currentTierScore.toFixed(1)}점 × 30% + 내전지표 ${inhouseScore.toFixed(1)}점 × 10% = ${base.adjustedScore.toFixed(1)}점입니다.`,
        `솔랭 최근폼 ${soloRecentFormBonus.toFixed(1)}점, 포지션 숙련도 ${positionSkill.positionSkillBonus.toFixed(1)}점, 내부 MMR ${mmrBonus.toFixed(1)}점, 관리자 보정 ${balanceOverrideScore.toFixed(1)}점, 배정 감점 ${rolePenalty.toFixed(1)}점을 반영했습니다.`,
        `최종 반영점수는 ${score.toFixed(1)}점입니다. S급 보정은 개인 점수 직접 가산이 아니라 고티어 분산 평가에 사용됩니다.`,
      ],
    };
  });

  const evalPlayers: BalanceEvaluatePlayer[] = resolved.map((player) => ({
    playerId: player.playerId,
    name: player.name,
    team: player.team,
    position: player.position,
    roleType: player.roleType as TeamBalanceRoleType,
    score: player.score,
  }));
  const evaluation = evaluateBalanceLayout({ assignments: evalPlayers, optionNo: null, optionTitle: "수동 조정안" });

  const red = resolved.filter((player) => player.team === "RED").sort((a, b) => TEAM_BALANCE_POSITIONS.indexOf(a.position) - TEAM_BALANCE_POSITIONS.indexOf(b.position));
  const blue = resolved.filter((player) => player.team === "BLUE").sort((a, b) => TEAM_BALANCE_POSITIONS.indexOf(a.position) - TEAM_BALANCE_POSITIONS.indexOf(b.position));

  return {
    optionNo: undefined,
    optionTitle: "수동 조정안",
    optionDescription: "저장 전 드래그 배치를 서버 DB 기준으로 다시 계산한 결과입니다.",
    red,
    blue,
    ...evaluation,
    serverEvaluationMode: "MANUAL_RECALCULATED" as const,
  };
}
