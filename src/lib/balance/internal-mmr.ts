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
