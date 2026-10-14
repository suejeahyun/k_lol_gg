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
  const fairness = candidate.score.fairness;
  const label = candidate.source === "MANUAL" ? "수동 조정안" : fairness ? "내전 규칙 전체탐색 추천" : "이전 계산 결과";
  const status = fairness ? { BALANCED: "균형 추천", CONDITIONAL: "조건부 편성", REVIEW_REQUIRED: "정보 확인 필요", INVALID: "필수 조건 위반" }[fairness.status] : "규칙 재평가 필요";
  const notes = fairness ? [...new Set([...fairness.hardViolations, ...fairness.warnings])].map((note) => {
    let safeNote = oneLine(note);
    for (const [playerId, name] of names) safeNote = safeNote.replaceAll(playerId, name || "참가자");
    return safeNote;
  }) : ["이전 결과는 최신 규칙으로 재평가해 주세요."];
  return `BLUE ${teamLine("BLUE")}\nRED ${teamLine("RED")}\n내전 규칙: ${status}${notes.length ? `\n주의: ${notes.join(" / ")}` : ""}\n밸런스 판단: ${label} / RED ${prediction.predictedRedWinRate.toFixed(1)}% vs BLUE ${prediction.predictedBlueWinRate.toFixed(1)}%\n※ 승률은 점수 기반 참고 추정이며 검증된 실제 승률이 아닙니다.`;
}

function predictedFromTotals(score: EvaluatedTeamBalanceLayout["score"]) {
  const redRate = Number(((1 / (1 + 10 ** ((score.teamStrength.blueTotal - score.teamStrength.redTotal) / 40))) * 100).toFixed(1));
  return { predictedRedWinRate: redRate, predictedBlueWinRate: Number((100 - redRate).toFixed(1)) };
}
