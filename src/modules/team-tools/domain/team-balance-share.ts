import { TEAM_BALANCE_POSITIONS, type EvaluatedTeamBalanceLayout } from "./team-balance";
import type { TeamBalanceDraftCandidate, TeamBalanceDraftParticipant } from "./team-balance-draft";

function oneLine(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * V1 copy format, adapted to use the draft's nickname snapshot instead of the
 * private member-name field. No draft id, account id, URL or access token is shared.
 */
export function formatTeamBalanceShareText(
  candidate: Pick<TeamBalanceDraftCandidate, "assignments" | "score" | "source">,
  participants: readonly Pick<TeamBalanceDraftParticipant, "playerId" | "displayName">[],
) {
  const names = new Map(participants.map((participant) => [participant.playerId, oneLine(participant.displayName)]));
  const teamLine = (team: "BLUE" | "RED") => candidate.assignments
    .filter((entry) => entry.team === team)
    .sort((left, right) => TEAM_BALANCE_POSITIONS.indexOf(left.position) - TEAM_BALANCE_POSITIONS.indexOf(right.position))
    .map((entry) => names.get(entry.playerId) || "알 수 없음")
    .join(" ");
  const prediction = candidate.score.v1 ?? predictedFromTotals(candidate.score);
  const label = candidate.source === "MANUAL" ? "수동 조정안" : "AI 전체탐색 최고안";
  return `BLUE ${teamLine("BLUE")}\nRED ${teamLine("RED")}\n밸런스 판단: ${label} / RED ${prediction.predictedRedWinRate.toFixed(1)}% vs BLUE ${prediction.predictedBlueWinRate.toFixed(1)}%`;
}

function predictedFromTotals(score: EvaluatedTeamBalanceLayout["score"]) {
  const redRate = Number(((1 / (1 + 10 ** ((score.teamStrength.blueTotal - score.teamStrength.redTotal) / 40))) * 100).toFixed(1));
  return { predictedRedWinRate: redRate, predictedBlueWinRate: Number((100 - redRate).toFixed(1)) };
}
