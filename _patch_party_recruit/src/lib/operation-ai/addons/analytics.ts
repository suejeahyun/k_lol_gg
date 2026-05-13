import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { addDays, getKstDateKey, getKstStartOfDate } from "@/lib/date/kst";
import { getTierScore } from "@/lib/balance/tierScore";
import type {
  NoticeGenerateInput,
  NoticeType,
  OperationAiAddonDashboard,
  OperationIssue,
  OperationModeRecommendation,
  PlayerTag,
  PositionKey,
  Severity,
} from "./types";

const POSITIONS: PositionKey[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function asDateKey(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return getKstDateKey();
}

function getLevel(score: number): Severity {
  if (score >= 70) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

function levelLabel(level: Severity) {
  if (level === "HIGH") return "높음";
  if (level === "MEDIUM") return "중간";
  return "낮음";
}

function positionLabel(position: string) {
  const labels: Record<string, string> = {
    TOP: "탑",
    JGL: "정글",
    MID: "미드",
    ADC: "원딜",
    SUP: "서포터",
    ALL: "올라인",
    UNKNOWN: "미정",
  };
  return labels[position] ?? position;
}

function normalizePosition(value: unknown): PositionKey {
  return typeof value === "string" && ["TOP", "JGL", "MID", "ADC", "SUP", "ALL"].includes(value)
    ? (value as PositionKey)
    : "UNKNOWN";
}

function calcOperationMode(participantCount: number): OperationModeRecommendation {
  if (participantCount < 8) {
    return {
      participantCount,
      mode: "추가 모집 우선",
      reason: "8명 미만은 정상 5:5 운영이 어렵습니다.",
      warnings: ["최소 10명까지 모집하는 편이 안정적입니다."],
    };
  }
  if (participantCount === 9) {
    return {
      participantCount,
      mode: "1명 추가 모집 후 5:5",
      reason: "9명은 한 명만 추가되면 바로 정상 운영이 가능합니다.",
      warnings: ["임시 용병 또는 대기자를 먼저 확인하세요."],
    };
  }
  if (participantCount === 10) {
    return {
      participantCount,
      mode: "5:5 단판/다전제",
      reason: "대기 인원 없이 가장 안정적으로 진행할 수 있습니다.",
      warnings: [],
    };
  }
  if (participantCount >= 11 && participantCount <= 14) {
    return {
      participantCount,
      mode: "10명 확정 + 예비/교체 운영",
      reason: "5명 단위가 아니므로 일부 대기 또는 교체 운영이 필요합니다.",
      warnings: ["확정 10명과 예비 인원을 명확히 분리하세요."],
    };
  }
  if (participantCount === 15) {
    return {
      participantCount,
      mode: "3팀 로테이션",
      reason: "5명 단위로 정확히 나뉘어 전원 참여가 가능합니다.",
      warnings: ["정글/서포터 가능자가 3명 이상인지 확인하세요."],
    };
  }
  if (participantCount >= 16 && participantCount <= 19) {
    return {
      participantCount,
      mode: "15명 로테이션 + 예비 또는 20명 추가 모집",
      reason: "4팀 운영에는 인원이 부족하고 3팀 운영에는 초과 인원이 있습니다.",
      warnings: ["20명까지 모집 가능하면 4팀 운영이 더 깔끔합니다."],
    };
  }
  return {
    participantCount,
    mode: "4팀 토너먼트 또는 2개 방 운영",
    reason: "20명 이상이면 4팀 구성이 가능합니다.",
    warnings: ["운영자/중계/결과 등록 담당을 미리 분리하세요."],
  };
}

async function getActiveSeason() {
  return prisma.season.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });
}

async function getTodayApplies(seasonId: number, dateKey: string) {
  const start = getKstStartOfDate(dateKey);
  const end = addDays(start, 1);

  return prisma.seasonParticipationApply.findMany({
    where: {
      seasonId,
      applyDate: {
        gte: start,
        lt: end,
      },
    },
    include: {
      player: {
        select: {
          id: true,
          name: true,
          nickname: true,
          tag: true,
          currentTier: true,
          peakTier: true,
          createdAt: true,
          balanceProfile: true,
          seasonStats: {
            where: { seasonId },
            select: { totalGames: true, wins: true, losses: true, mvpCount: true, participationCount: true },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
}

type TodayApply = Awaited<ReturnType<typeof getTodayApplies>>[number];

function analyzeToday(applies: TodayApply[]) {
  const active = applies.filter((apply) => apply.status === "APPLIED");
  const cancelled = applies.filter((apply) => apply.status === "CANCELLED");
  const positionCounts: Record<string, number> = { TOP: 0, JGL: 0, MID: 0, ADC: 0, SUP: 0, ALL: 0, UNKNOWN: 0 };

  for (const apply of active) {
    positionCounts[normalizePosition(apply.mainPosition)] += 1;
  }

  const missingPositions = POSITIONS.filter((position) => positionCounts[position] === 0);

  return {
    active,
    cancelled,
    positionCounts,
    missingPositions,
  };
}

function buildRiskIssues(active: TodayApply[], cancelled: TodayApply[], positionCounts: Record<string, number>, missingPositions: string[]) {
  const issues: OperationIssue[] = [];
  const count = active.length;

  if (count < 10) {
    issues.push({
      severity: "HIGH",
      title: "10명 미만",
      description: `현재 신청 인원이 ${count}명입니다. 정상 5:5 운영 기준에 부족합니다.`,
      suggestion: `${10 - count}명 이상 추가 모집 후 팀 밸런스를 진행하세요.`,
    });
  }

  if (count > 10 && count % 5 !== 0) {
    issues.push({
      severity: "MEDIUM",
      title: "5명 단위가 아닌 참가자 수",
      description: `${count}명은 팀 단위 운영 시 대기 또는 교체 인원이 발생합니다.`,
      suggestion: "10명 확정 + 예비 운영 또는 15/20명까지 추가 모집을 권장합니다.",
    });
  }

  for (const position of missingPositions) {
    issues.push({
      severity: position === "JGL" || position === "SUP" ? "HIGH" : "MEDIUM",
      title: `${positionLabel(position)} 주포지션 부족`,
      description: `${positionLabel(position)} 주포지션 신청자가 없습니다.`,
      suggestion: `${positionLabel(position)} 가능자를 별도 확인하세요.`,
    });
  }

  for (const position of POSITIONS) {
    if (positionCounts[position] >= 4) {
      issues.push({
        severity: "MEDIUM",
        title: `${positionLabel(position)} 신청 쏠림`,
        description: `${positionLabel(position)} 주포지션 신청자가 ${positionCounts[position]}명입니다.`,
        suggestion: "부포지션 가능 여부를 사전에 확인하면 팀 밸런스 품질이 올라갑니다.",
      });
    }
  }

  const highTierPlayers = active.filter((apply) => {
    const tier = `${apply.player.currentTier ?? ""} ${apply.player.peakTier ?? ""}`.toUpperCase();
    return tier.includes("MASTER") || tier.includes("GRAND") || tier.includes("CHALLENGER") || tier.includes("DIAMOND 1") || tier.includes("D1");
  });

  if (highTierPlayers.length >= 3) {
    issues.push({
      severity: "MEDIUM",
      title: "고티어 영향도 집중 가능성",
      description: `상위 티어로 보이는 참가자가 ${highTierPlayers.length}명입니다.`,
      suggestion: "고티어 유저는 주포지션 고정 후 라인별로 분산하세요.",
    });
  }

  if (cancelled.length > 0) {
    issues.push({
      severity: "LOW",
      title: "취소 인원 발생",
      description: `오늘 취소 상태인 신청자가 ${cancelled.length}명 있습니다.`,
      suggestion: "마감 전 확정 인원을 다시 확인하세요.",
    });
  }

  const lowDataPlayers = active.filter((apply) => {
    const stat = apply.player.seasonStats[0];
    const analyzed = apply.player.balanceProfile?.matchesAnalyzed ?? 0;
    return !stat || stat.totalGames < 3 || analyzed < 3;
  });

  if (lowDataPlayers.length >= 2) {
    issues.push({
      severity: "MEDIUM",
      title: "데이터 부족 유저 다수",
      description: `최근 내전/AI MMR 데이터가 부족한 유저가 ${lowDataPlayers.length}명입니다.`,
      suggestion: "신규 유저는 주포지션 우선 배정하고 첫 3경기는 보정 폭을 크게 두는 것이 좋습니다.",
    });
  }

  const score = issues.reduce((sum, issue) => sum + (issue.severity === "HIGH" ? 35 : issue.severity === "MEDIUM" ? 18 : 8), 0);
  return { issues, score: Math.min(100, score), level: getLevel(score) };
}

async function buildNoShowRisk(seasonId: number, active: TodayApply[]) {
  const playerIds = active.map((apply) => apply.playerId);
  if (playerIds.length === 0) {
    return { riskyPlayers: [], spareCountRecommendation: 0 };
  }

  const since = addDays(new Date(), -90);
  const histories = await prisma.seasonParticipationApply.findMany({
    where: {
      seasonId,
      playerId: { in: playerIds },
      createdAt: { gte: since },
    },
    select: {
      playerId: true,
      status: true,
      applyDate: true,
      player: { select: { id: true, name: true, nickname: true, tag: true } },
    },
  });

  const matches = await prisma.matchParticipant.findMany({
    where: {
      playerId: { in: playerIds },
      game: {
        series: {
          seasonId,
          matchDate: { gte: since },
        },
      },
    },
    select: {
      playerId: true,
      game: { select: { series: { select: { matchDate: true } } } },
    },
  });

  const playedKeys = new Set(
    matches.map((row) => `${row.playerId}:${getKstDateKey(row.game.series.matchDate)}`),
  );

  const grouped = new Map<number, { player: (typeof histories)[number]["player"]; applied: number; cancelled: number; playedAfterApply: number }>();

  for (const row of histories) {
    const prev = grouped.get(row.playerId) ?? { player: row.player, applied: 0, cancelled: 0, playedAfterApply: 0 };
    prev.applied += 1;
    if (row.status === "CANCELLED") prev.cancelled += 1;
    if (playedKeys.has(`${row.playerId}:${getKstDateKey(row.applyDate)}`)) prev.playedAfterApply += 1;
    grouped.set(row.playerId, prev);
  }

  const riskyPlayers = Array.from(grouped.entries())
    .map(([playerId, row]) => {
      const cancelRate = row.applied > 0 ? row.cancelled / row.applied : 0;
      const missRate = row.applied > 0 ? Math.max(0, row.applied - row.cancelled - row.playedAfterApply) / row.applied : 0;
      const riskScore = Math.min(100, Math.round(cancelRate * 45 + missRate * 55));
      const reasons: string[] = [];
      if (cancelRate >= 0.25) reasons.push(`최근 신청 취소율 ${pct(cancelRate * 100)}`);
      if (missRate >= 0.25) reasons.push(`신청 대비 경기 기록 누락 ${pct(missRate * 100)}`);
      if (row.applied < 3) reasons.push("최근 신청 데이터 부족");
      return {
        playerId,
        name: row.player.name,
        nickname: row.player.nickname,
        tag: row.player.tag,
        applied: row.applied,
        cancelled: row.cancelled,
        playedAfterApply: row.playedAfterApply,
        riskScore,
        reasons,
      };
    })
    .filter((row) => row.riskScore >= 25 || row.reasons.includes("최근 신청 데이터 부족"))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);

  const highRiskCount = riskyPlayers.filter((row) => row.riskScore >= 45).length;
  return { riskyPlayers, spareCountRecommendation: Math.min(3, Math.max(0, highRiskCount)) };
}

async function buildSeasonReport(seasonId: number) {
  const [games, stats] = await Promise.all([
    prisma.matchGame.findMany({
      where: { series: { seasonId } },
      select: { winnerTeam: true, seriesId: true },
    }),
    prisma.playerSeasonStat.findMany({
      where: { seasonId },
      include: { player: { select: { id: true, name: true } } },
      orderBy: [{ totalGames: "desc" }, { wins: "desc" }],
      take: 10,
    }),
  ]);

  const uniqueSeries = new Set(games.map((game) => game.seriesId));
  const redWins = games.filter((game) => game.winnerTeam === "RED").length;
  const blueWins = games.filter((game) => game.winnerTeam === "BLUE").length;
  const topParticipants = stats.slice(0, 5).map((stat) => ({
    playerId: stat.playerId,
    name: stat.player.name,
    games: stat.totalGames,
    wins: stat.wins,
    winRate: stat.totalGames > 0 ? round1((stat.wins / stat.totalGames) * 100) : 0,
  }));

  const topMvp = [...stats]
    .sort((a, b) => b.mvpCount - a.mvpCount)
    .slice(0, 5)
    .map((stat) => ({ playerId: stat.playerId, name: stat.player.name, mvpCount: stat.mvpCount }));

  const notes: string[] = [];
  if (games.length > 0) {
    const redRate = redWins / games.length;
    if (redRate >= 0.6) notes.push(`RED 승률이 ${pct(redRate * 100)}로 높습니다. 진영 편향 또는 배정 쏠림을 점검하세요.`);
    if (redRate <= 0.4) notes.push(`BLUE 승률이 ${pct((1 - redRate) * 100)}로 높습니다. 진영 편향 또는 배정 쏠림을 점검하세요.`);
  }
  if (topParticipants.length > 0) notes.push(`최다 참여자는 ${topParticipants[0].name}(${topParticipants[0].games}게임)입니다.`);

  return {
    totalSeries: uniqueSeries.size,
    totalGames: games.length,
    redWins,
    blueWins,
    topParticipants,
    topMvp,
    notes,
  };
}

async function buildDataAudit(seasonId: number) {
  const issues: OperationIssue[] = [];
  const series = await prisma.matchSeries.findMany({
    where: { seasonId },
    orderBy: { matchDate: "desc" },
    take: 40,
    include: {
      games: {
        include: {
          participants: {
            select: { playerId: true, team: true, position: true, kills: true, deaths: true, assists: true, championId: true },
          },
        },
      },
    },
  });

  for (const match of series) {
    for (const game of match.games) {
      const label = `${match.title} ${game.gameNumber}세트`;
      const blue = game.participants.filter((p) => p.team === "BLUE");
      const red = game.participants.filter((p) => p.team === "RED");
      if (blue.length !== 5 || red.length !== 5) {
        issues.push({
          severity: "HIGH",
          title: `${label}: 팀 인원 오류`,
          description: `BLUE ${blue.length}명, RED ${red.length}명입니다.`,
          suggestion: "경기 상세에서 참가자 수를 수정하세요.",
        });
      }

      for (const team of ["BLUE", "RED"] as const) {
        const teamRows = game.participants.filter((p) => p.team === team);
        const seen = new Set<string>();
        for (const row of teamRows) {
          if (seen.has(row.position)) {
            issues.push({
              severity: "MEDIUM",
              title: `${label}: ${team} 포지션 중복`,
              description: `${team} 팀에 ${row.position} 포지션이 중복되어 있습니다.`,
              suggestion: "TOP/JGL/MID/ADC/SUP가 1명씩인지 확인하세요.",
            });
          }
          seen.add(row.position);
        }
      }

      const playerIds = game.participants.map((p) => p.playerId);
      if (new Set(playerIds).size !== playerIds.length) {
        issues.push({
          severity: "HIGH",
          title: `${label}: 플레이어 중복`,
          description: "같은 플레이어가 한 게임에 2회 이상 등록되어 있습니다.",
          suggestion: "중복 참가자를 삭제하거나 올바른 플레이어로 교체하세요.",
        });
      }

      for (const row of game.participants) {
        if (row.kills > 60 || row.deaths > 40 || row.assists > 80 || row.kills < 0 || row.deaths < 0 || row.assists < 0) {
          issues.push({
            severity: "MEDIUM",
            title: `${label}: KDA 이상치`,
            description: `${row.kills}/${row.deaths}/${row.assists} 값이 비정상 범위입니다.`,
            suggestion: "이미지 분석 또는 수동 입력 값을 다시 확인하세요.",
          });
        }
      }
    }
  }

  return {
    dangerCount: issues.filter((issue) => issue.severity === "HIGH").length,
    warningCount: issues.filter((issue) => issue.severity !== "HIGH").length,
    issues: issues.slice(0, 20),
  };
}

function buildPlayerTags(active: TodayApply[]): PlayerTag[] {
  return active.map((apply) => {
    const stat = apply.player.seasonStats[0];
    const profile = apply.player.balanceProfile;
    const tags: string[] = [];
    const reasons: string[] = [];

    if (!stat || stat.totalGames < 3 || !profile || profile.matchesAnalyzed < 3) {
      tags.push("데이터 부족");
      reasons.push("내전 또는 AI MMR 분석 경기 수가 부족합니다.");
    }
    if (stat && stat.totalGames >= 10) {
      tags.push("안정 참여");
      reasons.push(`이번 시즌 ${stat.totalGames}게임 참여 기록이 있습니다.`);
    }
    if (profile && profile.overallMmr >= 60) {
      tags.push("고영향 유저");
      reasons.push(`AI MMR ${round1(profile.overallMmr)}점입니다.`);
    }
    if (apply.subPositions.length >= 2 || apply.mainPosition === "ALL") {
      tags.push("포지션 유연");
      reasons.push("부포지션 또는 올라인 신청 이력이 있습니다.");
    }
    if (apply.mainPosition === "JGL" || apply.subPositions.includes("JGL")) {
      tags.push("정글 가능");
      reasons.push("정글 가능 포지션으로 신청했습니다.");
    }

    return {
      playerId: apply.playerId,
      name: apply.player.name,
      nickname: apply.player.nickname,
      tag: apply.player.tag,
      tags: tags.length > 0 ? tags : ["일반"],
      reasons,
    };
  });
}

async function buildBalanceFailureLearning() {
  const reviews = await prisma.balanceMatchReview.findMany({
    where: { actualWinner: { not: null }, aiInferredWinner: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      actualWinner: true,
      aiInferredWinner: true,
      maxLineDiff: true,
      midJglDiff: true,
      bottomDiff: true,
      autoCount: true,
      highTierOffRoleCount: true,
    },
  });

  const failed = reviews.filter((review) => review.actualWinner && review.aiInferredWinner && review.actualWinner !== review.aiInferredWinner);
  const patterns = [
    {
      title: "라인 격차 과소평가",
      count: failed.filter((review) => (review.maxLineDiff ?? 0) >= 15).length,
      description: "예측 실패 경기 중 특정 라인 점수 차이가 큰 경우입니다.",
    },
    {
      title: "미드-정글 영향 과소평가",
      count: failed.filter((review) => (review.midJglDiff ?? 0) >= 12).length,
      description: "초반 주도권 라인 차이가 결과에 크게 작용했을 가능성이 있습니다.",
    },
    {
      title: "바텀 시너지 과소평가",
      count: failed.filter((review) => (review.bottomDiff ?? 0) >= 12).length,
      description: "ADC/SUP 조합 차이를 더 강하게 반영할 필요가 있습니다.",
    },
    {
      title: "AUTO/오프포지션 리스크",
      count: failed.filter((review) => (review.autoCount ?? 0) >= 2 || (review.highTierOffRoleCount ?? 0) >= 1).length,
      description: "자동 배정 또는 고티어 오프포지션이 예측 오차를 만들었을 수 있습니다.",
    },
  ];

  return { totalReviews: reviews.length, failedPredictionCount: failed.length, patterns };
}

async function buildChampionMastery(seasonId: number) {
  const stats = await prisma.playerChampionStat.findMany({
    where: { seasonId, games: { gte: 3 } },
    include: {
      player: { select: { id: true, name: true } },
      champion: { select: { name: true } },
    },
    orderBy: [{ wins: "desc" }, { games: "desc" }],
    take: 20,
  });

  return stats
    .map((stat) => ({
      playerId: stat.playerId,
      playerName: stat.player.name,
      championName: stat.champion.name,
      games: stat.games,
      wins: stat.wins,
      winRate: stat.games > 0 ? round1((stat.wins / stat.games) * 100) : 0,
      mvpCount: stat.mvpCount,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, 10);
}

function buildNewPlayerEstimates(active: TodayApply[]) {
  return active
    .map((apply) => {
      const stat = apply.player.seasonStats[0];
      const games = stat?.totalGames ?? 0;
      const tierScore = Math.max(
        getTierScore(apply.player.currentTier ?? undefined),
        getTierScore(apply.player.peakTier ?? undefined) * 0.9,
        45,
      );
      const profileScore = apply.player.balanceProfile?.overallMmr ?? tierScore;
      const provisionalScore = round1(games < 3 ? tierScore * 0.7 + profileScore * 0.3 : profileScore);
      const confidence: Severity = games >= 8 ? "LOW" : games >= 3 ? "MEDIUM" : "HIGH";
      return {
        playerId: apply.playerId,
        name: apply.player.name,
        nickname: apply.player.nickname,
        provisionalScore,
        confidence,
        reason: games < 3 ? "신규/저데이터 유저라 티어 기반 임시 점수 비중을 높였습니다." : "기존 내전 기록과 AI MMR을 함께 반영했습니다.",
      };
    })
    .filter((row) => row.confidence !== "LOW")
    .slice(0, 10);
}

function buildTodoPriority(riskIssues: OperationIssue[], dataIssues: OperationIssue[], noShowCount: number) {
  const todos: OperationIssue[] = [];
  todos.push(...riskIssues.filter((issue) => issue.severity === "HIGH"));
  if (noShowCount > 0) {
    todos.push({
      severity: "MEDIUM",
      title: "참가 안정성 확인",
      description: `노쇼/취소 위험이 있는 참가자가 ${noShowCount}명 있습니다.`,
      suggestion: "시작 전 카카오방에서 확정 여부를 다시 확인하세요.",
    });
  }
  todos.push(...dataIssues.filter((issue) => issue.severity === "HIGH"));
  return todos.slice(0, 8);
}

export async function buildOperationAiAddonDashboard(dateKeyInput?: string | null): Promise<OperationAiAddonDashboard> {
  const dateKey = asDateKey(dateKeyInput);
  const season = await getActiveSeason();

  if (!season) {
    return {
      generatedAt: new Date().toISOString(),
      season: null,
      today: {
        dateKey,
        participantCount: 0,
        activeApplyCount: 0,
        cancelledApplyCount: 0,
        positionCounts: {},
        missingPositions: POSITIONS,
      },
      risk: { level: "HIGH", score: 100, issues: [{ severity: "HIGH", title: "활성 시즌 없음", description: "현재 활성 시즌이 없어 운영 AI 분석을 진행할 수 없습니다." }] },
      noShow: { riskyPlayers: [], spareCountRecommendation: 0 },
      noticeSamples: [],
      seasonReport: { totalSeries: 0, totalGames: 0, redWins: 0, blueWins: 0, topParticipants: [], topMvp: [], notes: [] },
      dataAudit: { dangerCount: 0, warningCount: 0, issues: [] },
      playerTags: [],
      operationMode: calcOperationMode(0),
      balanceFailureLearning: { totalReviews: 0, failedPredictionCount: 0, patterns: [] },
      championMastery: [],
      todoPriority: [],
      newPlayerEstimates: [],
    };
  }

  const applies = await getTodayApplies(season.id, dateKey);
  const { active, cancelled, positionCounts, missingPositions } = analyzeToday(applies);
  const risk = buildRiskIssues(active, cancelled, positionCounts, missingPositions);
  const [noShow, seasonReport, dataAudit, balanceFailureLearning, championMastery] = await Promise.all([
    buildNoShowRisk(season.id, active),
    buildSeasonReport(season.id),
    buildDataAudit(season.id),
    buildBalanceFailureLearning(),
    buildChampionMastery(season.id),
  ]);

  const dashboardBase = {
    generatedAt: new Date().toISOString(),
    season,
    today: {
      dateKey,
      participantCount: active.length,
      activeApplyCount: active.length,
      cancelledApplyCount: cancelled.length,
      positionCounts,
      missingPositions,
    },
    risk,
    noShow,
    seasonReport,
    dataAudit,
    playerTags: buildPlayerTags(active),
    operationMode: calcOperationMode(active.length),
    balanceFailureLearning,
    championMastery,
    todoPriority: buildTodoPriority(risk.issues, dataAudit.issues, noShow.riskyPlayers.length),
    newPlayerEstimates: buildNewPlayerEstimates(active),
  };

  const noticeSamples = await Promise.all([
    generateOperationNotice({ type: "NOON_RECRUIT", now: new Date() }, dashboardBase),
    generateOperationNotice({ type: "POSITION_RECRUIT", now: new Date() }, dashboardBase),
    generateOperationNotice({ type: "START_SOON", now: new Date() }, dashboardBase),
  ]);

  return {
    ...dashboardBase,
    noticeSamples: noticeSamples.map((item) => ({ type: item.type, title: item.title, text: item.text })),
  };
}

function inferNoticeTypeFromSlot(slot?: string | number | null): NoticeType {
  const text = String(slot ?? "").padStart(2, "0");
  if (text.startsWith("12")) return "NOON_RECRUIT";
  if (text.startsWith("15")) return "AFTERNOON_CHECK";
  if (text.startsWith("18")) return "EVENING_FINAL";
  if (text.startsWith("20")) return "START_SOON";
  return "NOON_RECRUIT";
}

function titleForNotice(type: NoticeType) {
  const titles: Record<NoticeType, string> = {
    NOON_RECRUIT: "12시 참가 독려 공지",
    AFTERNOON_CHECK: "15시 중간 점검 공지",
    EVENING_FINAL: "18시 최종 모집 공지",
    START_SOON: "20시 시작 전 공지",
    POSITION_RECRUIT: "부족 포지션 모집 공지",
    TEAM_ANNOUNCE: "팀 발표 공지",
    RESULT_SUMMARY: "결과 요약 공지",
  };
  return titles[type];
}

function formatPositionCounts(counts: Record<string, number>) {
  return POSITIONS.map((position) => `${positionLabel(position)} ${counts[position] ?? 0}명`).join(" / ");
}

export async function generateOperationNotice(input: NoticeGenerateInput, prebuilt?: Partial<OperationAiAddonDashboard>) {
  const type = input.type ?? inferNoticeTypeFromSlot(input.slot);
  const cached = prebuilt ?? {};
  const dashboard = cached.season && cached.today && cached.risk && cached.operationMode
    ? (cached as OperationAiAddonDashboard)
    : await buildOperationAiAddonDashboard();

  const participantCount = dashboard.today.activeApplyCount;
  const lackCount = Math.max(0, 10 - participantCount);
  const missing = dashboard.today.missingPositions.map(positionLabel).join(", ") || "없음";
  const riskLevel = levelLabel(dashboard.risk.level);
  const spare = dashboard.noShow.spareCountRecommendation;
  const room = input.roomName ? `\n대상 방: ${input.roomName}` : "";

  const linesByType: Record<NoticeType, string[]> = {
    NOON_RECRUIT: [
      "[K-LOL.GG 내전 참가 안내]",
      `현재 참가자: ${participantCount}명`,
      lackCount > 0 ? `10명 기준 ${lackCount}명이 더 필요합니다.` : "현재 10명 이상 신청되어 팀 밸런스 검토가 가능합니다.",
      `포지션 현황: ${formatPositionCounts(dashboard.today.positionCounts)}`,
      dashboard.today.missingPositions.length > 0 ? `부족 포지션: ${missing}` : "현재 주포지션 공백은 없습니다.",
      "참가 가능하신 분은 사이트에서 내전 참가 신청 부탁드립니다.",
      room,
    ],
    AFTERNOON_CHECK: [
      "[K-LOL.GG 15시 참가 현황]",
      `현재 참가자: ${participantCount}명`,
      `운영 추천: ${dashboard.operationMode.mode}`,
      `운영 리스크: ${riskLevel}`,
      dashboard.today.missingPositions.length > 0 ? `추가 모집 우선 포지션: ${missing}` : "포지션 분포는 비교적 안정적입니다.",
      spare > 0 ? `예비 인원 ${spare}명 확보를 권장합니다.` : "현재 기준 예비 인원 위험도는 낮습니다.",
      "참가 확정/취소가 필요한 분은 미리 알려주세요.",
      room,
    ],
    EVENING_FINAL: [
      "[K-LOL.GG 18시 최종 모집 점검]",
      `현재 참가자: ${participantCount}명`,
      `추천 운영 방식: ${dashboard.operationMode.mode}`,
      dashboard.operationMode.warnings[0] ? `주의: ${dashboard.operationMode.warnings[0]}` : "주의: 팀 밸런스 후 바로 공지 예정입니다.",
      dashboard.today.missingPositions.length > 0 ? `부족 포지션: ${missing}` : "주요 포지션 공백은 없습니다.",
      "시작 전까지 변동이 있으면 빠르게 알려주세요.",
      room,
    ],
    START_SOON: [
      "[K-LOL.GG 내전 시작 전 안내]",
      `현재 참가자: ${participantCount}명`,
      `오늘 운영 방식: ${dashboard.operationMode.mode}`,
      "참가자는 보이스룸에 미리 입장해주세요.",
      "팀 배정 후 바로 경기 진행하겠습니다.",
      dashboard.risk.issues[0] ? `확인 필요: ${dashboard.risk.issues[0].title}` : "현재 큰 운영 리스크는 없습니다.",
      room,
    ],
    POSITION_RECRUIT: [
      "[K-LOL.GG 부족 포지션 모집]",
      `현재 참가자: ${participantCount}명`,
      `부족 포지션: ${missing}`,
      `포지션 현황: ${formatPositionCounts(dashboard.today.positionCounts)}`,
      "가능하신 분은 해당 포지션으로 참가 신청 부탁드립니다.",
      room,
    ],
    TEAM_ANNOUNCE: [
      "[K-LOL.GG 팀 배정 안내]",
      "팀 밸런스 결과가 확정되면 RED/BLUE 팀을 이 공지 형식으로 안내합니다.",
      "각자 포지션과 팀을 확인 후 보이스룸에 입장해주세요.",
      room,
    ],
    RESULT_SUMMARY: [
      "[K-LOL.GG 내전 결과 안내]",
      `이번 시즌 누적 경기: ${dashboard.seasonReport.totalGames}세트`,
      `RED ${dashboard.seasonReport.redWins}승 / BLUE ${dashboard.seasonReport.blueWins}승`,
      dashboard.seasonReport.topMvp[0]
        ? `현재 MVP 최다: ${dashboard.seasonReport.topMvp[0].name} ${dashboard.seasonReport.topMvp[0].mvpCount}회`
        : "MVP 데이터는 아직 부족합니다.",
      "상세 기록은 K-LOL.GG에서 확인 가능합니다.",
      room,
    ],
  };

  const text = linesByType[type].filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    type,
    title: titleForNotice(type),
    text,
    meta: {
      participantCount,
      missingPositions: dashboard.today.missingPositions,
      riskLevel: dashboard.risk.level,
      operationMode: dashboard.operationMode.mode,
    },
  };
}

export async function saveGeneratedNoticeLog(notice: { type: string; title: string; text: string; meta?: unknown }) {
  return prisma.operationAiRequest.create({
    data: {
      taskType: "NOTICE_GENERATE",
      status: "CONFIRMED",
      prompt: notice.title,
      rawText: notice.text,
      parsedJson: notice.meta as Prisma.InputJsonValue,
      resultJson: notice as Prisma.InputJsonValue,
      createdByUserId: "system",
    },
    select: { id: true },
  });
}
