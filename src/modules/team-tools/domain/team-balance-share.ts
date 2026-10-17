import { TEAM_BALANCE_POSITIONS } from "./team-balance";
import type { TeamBalanceDraftCandidate, TeamBalanceDraftParticipant } from "./team-balance-draft";

function oneLine(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export function formatTeamBalanceRelaxationReasons(
  candidate: Pick<TeamBalanceDraftCandidate, "score">,
  participants: readonly Pick<TeamBalanceDraftParticipant, "playerId" | "displayName">[],
) {
  const names = new Map(participants.map((participant) => [participant.playerId, oneLine(participant.displayName)]));
  const positionLabel = { TOP: "탑", JGL: "정글", MID: "미드", ADC: "원딜", SUP: "서포터" } as const;
  return candidate.score.fairness?.constraintRelaxation?.reasons.map((reason) => {
    let detail = oneLine(reason.detail);
    for (const [playerId, name] of names) detail = detail.replaceAll(playerId, name || "참가자");
    return `${reason.playerIds.map((playerId) => names.get(playerId) || "참가자").join(" · ")} · ${positionLabel[reason.position]}: ${detail}`;
  }) ?? [];
}

/**
 * Explicit owner/admin sharing: registered names in role order, exactly two lines.
 * A missing name stays explicit; nickname snapshots are not substituted for names.
 */
export function formatTeamBalanceShareText(
  candidate: Pick<TeamBalanceDraftCandidate, "assignments" | "score" | "source">,
  participants: readonly Pick<TeamBalanceDraftParticipant, "playerId" | "displayName" | "registeredName">[],
) {
  const names = new Map(participants.map((participant) => [participant.playerId, oneLine(participant.registeredName ?? "")]));
  const teamLine = (team: "BLUE" | "RED") => candidate.assignments
    .filter((entry) => entry.team === team)
    .sort((left, right) => TEAM_BALANCE_POSITIONS.indexOf(left.position) - TEAM_BALANCE_POSITIONS.indexOf(right.position))
    .map((entry) => names.get(entry.playerId) || "이름미등록")
    .join(" ");
  return `BLUE ${teamLine("BLUE")}\nRED ${teamLine("RED")}`;
}
