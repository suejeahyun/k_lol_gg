import type { Prisma, Position, Team } from "@prisma/client";

type Tx = Prisma.TransactionClient;

type MatchLike = {
  id: number;
  games: Array<{
    id: number;
    winnerTeam: Team;
    participants: Array<{
      playerId: number;
      championId: number;
      team: Team;
      position: Position;
      kills: number;
      deaths: number;
      assists: number;
    }>;
  }>;
};

const POSITION_MMR_FIELD: Record<Position, "topMmr" | "jungleMmr" | "midMmr" | "adcMmr" | "supportMmr"> = {
  TOP: "topMmr",
  JGL: "jungleMmr",
  MID: "midMmr",
  ADC: "adcMmr",
  SUP: "supportMmr",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function getKdaScore(kills: number, deaths: number, assists: number) {
  const kda = (kills + assists) / Math.max(1, deaths);
  return clamp((kda - 2.2) * 2.2, -4, 5);
}

function getDeathControlScore(deaths: number) {
  if (deaths <= 2) return 2;
  if (deaths <= 4) return 1;
  if (deaths <= 6) return 0;
  return -Math.min(4, deaths - 6);
}

function getPositionPerformanceWeight(position: Position) {
  if (position === "JGL" || position === "MID") return 1.1;
  if (position === "ADC") return 1.05;
  if (position === "SUP") return 0.95;
  return 1;
}

function getActualPerformanceScore(params: {
  position: Position;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}) {
  const winScore = params.win ? 8 : -8;
  const kdaScore = getKdaScore(params.kills, params.deaths, params.assists);
  const deathScore = getDeathControlScore(params.deaths);
  const assistSupportBonus = params.position === "SUP" ? clamp(params.assists / 4, 0, 3) : 0;

  return round(
    (50 + winScore + kdaScore + deathScore + assistSupportBonus) *
      getPositionPerformanceWeight(params.position),
  );
}

function getExpectedWinRate(redTotal: number, blueTotal: number) {
  const redExpected = 1 / (1 + 10 ** ((blueTotal - redTotal) / 40));
  return {
    red: round(redExpected * 100),
    blue: round((1 - redExpected) * 100),
  };
}

function getSeriesActualWinner(games: MatchLike["games"]): Team | null {
  const redWins = games.filter((game) => game.winnerTeam === "RED").length;
  const blueWins = games.filter((game) => game.winnerTeam === "BLUE").length;
  if (redWins === blueWins) return null;
  return redWins > blueWins ? "RED" : "BLUE";
}

function getAiMatchInference(params: {
  predictedRedWinRate: number;
  predictedBlueWinRate: number;
  actualWinner: Team | null;
  averageRedTotal: number;
  averageBlueTotal: number;
  maxLineGap: number;
  midJglGap: number;
  bottomGap: number;
}) {
  const expectedWinner =
    Math.abs(params.predictedRedWinRate - params.predictedBlueWinRate) < 3
      ? null
      : params.predictedRedWinRate > params.predictedBlueWinRate
        ? "RED"
        : "BLUE";
  const actualWinner = params.actualWinner;
  const upset = Boolean(expectedWinner && actualWinner && expectedWinner !== actualWinner);
  const riskScore =
    Math.abs(params.averageRedTotal - params.averageBlueTotal) * 0.6 +
    params.maxLineGap * 1.2 +
    params.midJglGap * 1.35 +
    params.bottomGap * 0.8 +
    (upset ? 12 : 0);
  const riskLevel = riskScore >= 32 ? "HIGH" : riskScore >= 18 ? "MEDIUM" : "LOW";
  const confidence = round(clamp(92 - riskScore, 0, 100));
  const aiInferredWinner = expectedWinner ?? actualWinner ?? null;
  const reasoning = [
    `예상 승률 RED ${params.predictedRedWinRate.toFixed(1)}% / BLUE ${params.predictedBlueWinRate.toFixed(1)}%를 실제 승리팀과 비교했습니다.`,
    `평균 전력 차이 ${Math.abs(params.averageRedTotal - params.averageBlueTotal).toFixed(1)}점, 최대 라인 격차 ${params.maxLineGap.toFixed(1)}점입니다.`,
    `미드-정글 격차 ${params.midJglGap.toFixed(1)}점, 바텀 격차 ${params.bottomGap.toFixed(1)}점을 핵심 리스크로 판단했습니다.`,
  ];
  if (upset) {
    reasoning.push("예상 우세 팀과 실제 승리팀이 달라 내부 MMR 보정 강도를 높게 판단했습니다.");
  }

  const riskFactors = [
    params.maxLineGap >= 10 ? `최대 라인 격차 ${params.maxLineGap.toFixed(1)}점` : null,
    params.midJglGap >= 8 ? `미드-정글 격차 ${params.midJglGap.toFixed(1)}점` : null,
    params.bottomGap >= 8 ? `바텀 격차 ${params.bottomGap.toFixed(1)}점` : null,
    upset ? "예상과 다른 승리팀" : null,
  ].filter(Boolean) as string[];

  const verdict =
    riskLevel === "LOW"
      ? "AI 판단: 밸런스 예측과 실제 결과의 괴리가 크지 않습니다."
      : riskLevel === "MEDIUM"
        ? "AI 판단: 일부 라인 또는 조합 리스크가 확인되어 다음 계산에서 MMR 보정이 필요합니다."
        : "AI 판단: 밸런스 실패 가능성이 높아 해당 라인/플레이어 MMR을 강하게 재검토해야 합니다.";

  return {
    aiVerdict: verdict,
    aiRiskLevel: riskLevel,
    aiConfidence: confidence,
    aiInferredWinner,
    aiReasoning: reasoning.join("\n"),
    aiRiskFactors: riskFactors.join("\n"),
    aiFormulaVersion: "v2.0.0",
  };
}

export function getPositionMmrValue(
  profile:
    | {
        topMmr: number;
        jungleMmr: number;
        midMmr: number;
        adcMmr: number;
        supportMmr: number;
      }
    | Record<Position, number>
    | null
    | undefined,
  position: Position,
) {
  if (!profile) return 50;

  if (position in profile) {
    return (profile as Record<Position, number>)[position] ?? 50;
  }

  return (profile as {
    topMmr: number;
    jungleMmr: number;
    midMmr: number;
    adcMmr: number;
    supportMmr: number;
  })[POSITION_MMR_FIELD[position]] ?? 50;
}

export function getMmrBonus(params: {
  overallMmr?: number | null;
  positionMmr?: number | null;
  confidence?: number | null;
}) {
  const confidence = clamp(params.confidence ?? 0, 0, 1);
  const overall = params.overallMmr ?? 50;
  const position = params.positionMmr ?? 50;
  const raw = ((overall - 50) * 0.08 + (position - 50) * 0.12) * confidence;
  return round(clamp(raw, -6, 6));
}

export async function updateInternalMmrAfterMatch(tx: Tx, match: MatchLike) {
  const playerIds = [
    ...new Set(match.games.flatMap((game) => game.participants.map((participant) => participant.playerId))),
  ];

  if (playerIds.length === 0) return;

  const existingProfiles = await tx.playerBalanceProfile.findMany({
    where: { playerId: { in: playerIds } },
  });
  const profileByPlayerId = new Map(existingProfiles.map((profile) => [profile.playerId, profile]));

  const allResults: Array<{
    matchSeriesId: number;
    gameId: number;
    playerId: number;
    championId: number;
    team: Team;
    position: Position;
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    expectedScoreBefore: number;
    actualPerformanceScore: number;
    mmrDelta: number;
    positionMmrDelta: number;
  }> = [];
  const gameReviews: Array<{
    redTotal: number;
    blueTotal: number;
    expectedRed: number;
    expectedBlue: number;
    maxLineGap: number;
    midJglGap: number;
    bottomGap: number;
  }> = [];

  for (const game of match.games) {
    const redParticipants = game.participants.filter((participant) => participant.team === "RED");
    const blueParticipants = game.participants.filter((participant) => participant.team === "BLUE");

    const redTotal = redParticipants.reduce((sum, participant) => {
      const profile = profileByPlayerId.get(participant.playerId);
      return sum + (profile?.overallMmr ?? 50) + getPositionMmrValue(profile, participant.position) * 0.25;
    }, 0);

    const blueTotal = blueParticipants.reduce((sum, participant) => {
      const profile = profileByPlayerId.get(participant.playerId);
      return sum + (profile?.overallMmr ?? 50) + getPositionMmrValue(profile, participant.position) * 0.25;
    }, 0);

    const expected = getExpectedWinRate(redTotal, blueTotal);
    const getPositionTeamTotal = (teamParticipants: typeof redParticipants, position: Position) => {
      const participant = teamParticipants.find((item) => item.position === position);
      if (!participant) return 0;
      const profile = profileByPlayerId.get(participant.playerId);
      return (profile?.overallMmr ?? 50) + getPositionMmrValue(profile, participant.position) * 0.25;
    };
    const lineGaps = (["TOP", "JGL", "MID", "ADC", "SUP"] as Position[]).map((position) =>
      Math.abs(getPositionTeamTotal(redParticipants, position) - getPositionTeamTotal(blueParticipants, position)),
    );
    const redMidJgl = getPositionTeamTotal(redParticipants, "MID") + getPositionTeamTotal(redParticipants, "JGL");
    const blueMidJgl = getPositionTeamTotal(blueParticipants, "MID") + getPositionTeamTotal(blueParticipants, "JGL");
    const redBottom = getPositionTeamTotal(redParticipants, "ADC") + getPositionTeamTotal(redParticipants, "SUP");
    const blueBottom = getPositionTeamTotal(blueParticipants, "ADC") + getPositionTeamTotal(blueParticipants, "SUP");
    gameReviews.push({
      redTotal: round(redTotal),
      blueTotal: round(blueTotal),
      expectedRed: expected.red,
      expectedBlue: expected.blue,
      maxLineGap: round(Math.max(...lineGaps)),
      midJglGap: round(Math.abs(redMidJgl - blueMidJgl)),
      bottomGap: round(Math.abs(redBottom - blueBottom)),
    });

    for (const participant of game.participants) {
      const profile = profileByPlayerId.get(participant.playerId);
      const expectedWinRate = participant.team === "RED" ? expected.red : expected.blue;
      const win = participant.team === game.winnerTeam;
      const actualPerformanceScore = getActualPerformanceScore({
        position: participant.position,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win,
      });
      const surprise = win ? (100 - expectedWinRate) / 100 : -(expectedWinRate / 100);
      const performanceDelta = (actualPerformanceScore - 50) / 8;
      const rawDelta = surprise * 8 + performanceDelta;
      const mmrDelta = round(clamp(rawDelta, -6, 6));
      const positionMmrDelta = round(clamp(rawDelta * 1.15, -7, 7));

      allResults.push({
        matchSeriesId: match.id,
        gameId: game.id,
        playerId: participant.playerId,
        championId: participant.championId,
        team: participant.team,
        position: participant.position,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win,
        expectedScoreBefore: round((profile?.overallMmr ?? 50) + getPositionMmrValue(profile, participant.position) * 0.25),
        actualPerformanceScore,
        mmrDelta,
        positionMmrDelta,
      });
    }
  }

  if (allResults.length > 0) {
    await tx.playerBalanceMatchResult.createMany({ data: allResults });
  }

  if (gameReviews.length > 0) {
    const averageRedTotal = round(gameReviews.reduce((sum, item) => sum + item.redTotal, 0) / gameReviews.length);
    const averageBlueTotal = round(gameReviews.reduce((sum, item) => sum + item.blueTotal, 0) / gameReviews.length);
    const predictedRedWinRate = round(gameReviews.reduce((sum, item) => sum + item.expectedRed, 0) / gameReviews.length);
    const predictedBlueWinRate = round(gameReviews.reduce((sum, item) => sum + item.expectedBlue, 0) / gameReviews.length);
    const maxLineGap = round(Math.max(...gameReviews.map((item) => item.maxLineGap)));
    const midJglGap = round(gameReviews.reduce((sum, item) => sum + item.midJglGap, 0) / gameReviews.length);
    const bottomGap = round(gameReviews.reduce((sum, item) => sum + item.bottomGap, 0) / gameReviews.length);
    const actualWinner = getSeriesActualWinner(match.games);
    const aiInference = getAiMatchInference({
      predictedRedWinRate,
      predictedBlueWinRate,
      actualWinner,
      averageRedTotal,
      averageBlueTotal,
      maxLineGap,
      midJglGap,
      bottomGap,
    });

    await tx.balanceMatchReview.create({
      data: {
        matchSeriesId: match.id,
        selectedOptionType: "AI_INFERRED_MMR",
        predictedRedWinRate,
        predictedBlueWinRate,
        actualWinner: actualWinner ?? undefined,
        redTotal: averageRedTotal,
        blueTotal: averageBlueTotal,
        diff: round(Math.abs(averageRedTotal - averageBlueTotal)),
        maxLineDiff: maxLineGap,
        midJglDiff: midJglGap,
        bottomDiff: bottomGap,
        autoCount: 0,
        highTierOffRoleCount: 0,
        qualityScore: aiInference.aiConfidence,
        ...aiInference,
      },
    });
  }

  const grouped = new Map<number, typeof allResults>();
  allResults.forEach((result) => {
    grouped.set(result.playerId, [...(grouped.get(result.playerId) ?? []), result]);
  });

  for (const [playerId, results] of grouped.entries()) {
    const current = profileByPlayerId.get(playerId);
    const overallDelta = round(results.reduce((sum, result) => sum + result.mmrDelta, 0) / results.length);
    const positionDeltas = new Map<Position, number[]>();
    results.forEach((result) => {
      positionDeltas.set(result.position, [...(positionDeltas.get(result.position) ?? []), result.positionMmrDelta]);
    });

    const nextMatchesAnalyzed = (current?.matchesAnalyzed ?? 0) + results.length;
    const nextConfidence = round(clamp(nextMatchesAnalyzed / 30, 0, 1));

    const updateData: Prisma.PlayerBalanceProfileUncheckedUpdateInput = {
      overallMmr: round(clamp((current?.overallMmr ?? 50) + overallDelta, 1, 120)),
      confidence: nextConfidence,
      matchesAnalyzed: nextMatchesAnalyzed,
      lastUpdatedAt: new Date(),
    };

    for (const [position, deltas] of positionDeltas.entries()) {
      const field = POSITION_MMR_FIELD[position];
      const averageDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
      updateData[field] = round(clamp((current?.[field] ?? 50) + averageDelta, 1, 120));
    }

    await tx.playerBalanceProfile.upsert({
      where: { playerId },
      create: {
        playerId,
        overallMmr: typeof updateData.overallMmr === "number" ? updateData.overallMmr : 50,
        topMmr: typeof updateData.topMmr === "number" ? updateData.topMmr : current?.topMmr ?? 50,
        jungleMmr: typeof updateData.jungleMmr === "number" ? updateData.jungleMmr : current?.jungleMmr ?? 50,
        midMmr: typeof updateData.midMmr === "number" ? updateData.midMmr : current?.midMmr ?? 50,
        adcMmr: typeof updateData.adcMmr === "number" ? updateData.adcMmr : current?.adcMmr ?? 50,
        supportMmr: typeof updateData.supportMmr === "number" ? updateData.supportMmr : current?.supportMmr ?? 50,
        confidence: nextConfidence,
        matchesAnalyzed: nextMatchesAnalyzed,
        lastUpdatedAt: new Date(),
      },
      update: updateData,
    });
  }
}
