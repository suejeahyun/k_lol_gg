import type { RiotMatchDto } from "@/modules/riot/domain/riot-player-analytics";

export type MatchChartMetric = "totalGold" | "cs" | "xp" | "teamGold";
export const MATCH_CHART_LABELS: Readonly<Record<MatchChartMetric, string>> = { totalGold: "골드", cs: "CS", xp: "경험치", teamGold: "팀 골드 차이" };

/** A missing participant or frame is unknown, never zero or interpolated. */
export function matchGrowthSeries(match: RiotMatchDto, metric: MatchChartMetric) {
  const self = match.participants.find((row) => row.participantId === match.selfParticipantId);
  if (!self || !match.timeline) return [];
  const opponents = self.position && match.mapId === 11 ? match.participants.filter((row) => row.teamId !== self.teamId && row.position === self.position) : [];
  const opponent = opponents.length === 1 ? opponents[0] : null;
  return match.timeline.frames.map((frame) => {
    if (metric === "teamGold") {
      if (new Set(match.participants.map((row) => row.teamId)).size !== 2) return { timestamp: frame.timestamp, value: null, opponent: null };
      const gold = (own: boolean) => {
        const members = match.participants.filter((row) => (row.teamId === self.teamId) === own);
        const values = members.map((row) => frame.participants.find((value) => value.participantId === row.participantId)?.totalGold);
        return values.length && values.every((value): value is number => typeof value === "number") ? values.reduce((sum, value) => sum + value, 0) : null;
      };
      const own = gold(true), enemy = gold(false);
      return { timestamp: frame.timestamp, value: own !== null && enemy !== null ? own - enemy : null, opponent: null };
    }
    return { timestamp: frame.timestamp, value: frame.participants.find((row) => row.participantId === self.participantId)?.[metric] ?? null,
      opponent: opponent ? frame.participants.find((row) => row.participantId === opponent.participantId)?.[metric] ?? null : null };
  });
}
