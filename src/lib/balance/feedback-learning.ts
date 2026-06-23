import type { Position, Prisma, Team } from "@prisma/client";
import { getPositionMmrValue } from "@/lib/balance/internal-mmr";

type Tx = Prisma.TransactionClient;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

const POSITION_FIELD: Record<Position, "topMmr" | "jungleMmr" | "midMmr" | "adcMmr" | "supportMmr"> = {
  TOP: "topMmr",
  JGL: "jungleMmr",
  MID: "midMmr",
  ADC: "adcMmr",
  SUP: "supportMmr",
};

export async function applyBalanceFeedbackToProfiles(tx: Tx, params: {
  matchSeriesId: number;
  feedbackRating?: string | null;
  feedbackProblemTeam?: Team | null;
  feedbackProblemLine?: Position | null;
}) {
  const rating = params.feedbackRating?.trim().toUpperCase();
  if (rating !== "BAD") {
    return { adjustedPlayers: 0, reason: "BAD 피드백이 아니므로 MMR 보정 없음" };
  }

  if (!params.feedbackProblemTeam && !params.feedbackProblemLine) {
    return { adjustedPlayers: 0, reason: "문제 팀/라인 미지정" };
  }

  const match = await tx.matchSeries.findUnique({
    where: { id: params.matchSeriesId },
    include: {
      games: {
        orderBy: [{ gameNumber: "asc" }, { id: "asc" }],
        include: { participants: true },
        take: 1,
      },
    },
  });

  const firstGame = match?.games[0];
  if (!firstGame) return { adjustedPlayers: 0, reason: "내전 참가자 없음" };

  const targetParticipants = firstGame.participants.filter((participant) => {
    if (params.feedbackProblemTeam && participant.team !== params.feedbackProblemTeam) return false;
    if (params.feedbackProblemLine && participant.position !== params.feedbackProblemLine) return false;
    return true;
  });

  if (targetParticipants.length === 0) {
    return { adjustedPlayers: 0, reason: "보정 대상 참가자 없음" };
  }

  for (const participant of targetParticipants) {
    const current = await tx.playerBalanceProfile.findUnique({ where: { playerId: participant.playerId } });
    const positionField = POSITION_FIELD[participant.position];
    const currentOverall = current?.overallMmr ?? 50;
    const currentPosition = getPositionMmrValue(current, participant.position);
    const overallDelta = params.feedbackProblemLine ? -0.6 : -0.35;
    const positionDelta = params.feedbackProblemLine ? -1.2 : -0.5;

    await tx.playerBalanceProfile.upsert({
      where: { playerId: participant.playerId },
      create: {
        playerId: participant.playerId,
        overallMmr: round(clamp(currentOverall + overallDelta, 1, 120)),
        topMmr: participant.position === "TOP" ? round(clamp(currentPosition + positionDelta, 1, 120)) : 50,
        jungleMmr: participant.position === "JGL" ? round(clamp(currentPosition + positionDelta, 1, 120)) : 50,
        midMmr: participant.position === "MID" ? round(clamp(currentPosition + positionDelta, 1, 120)) : 50,
        adcMmr: participant.position === "ADC" ? round(clamp(currentPosition + positionDelta, 1, 120)) : 50,
        supportMmr: participant.position === "SUP" ? round(clamp(currentPosition + positionDelta, 1, 120)) : 50,
        confidence: 0.15,
        matchesAnalyzed: 0,
        lastUpdatedAt: new Date(),
      },
      update: {
        overallMmr: round(clamp(currentOverall + overallDelta, 1, 120)),
        [positionField]: round(clamp(currentPosition + positionDelta, 1, 120)),
        lastUpdatedAt: new Date(),
      },
    });
  }

  return {
    adjustedPlayers: targetParticipants.length,
    reason: `운영자 BAD 피드백 기준으로 ${targetParticipants.length}명 보정`,
  };
}
