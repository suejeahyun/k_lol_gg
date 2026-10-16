import { TEAM_BALANCE_POSITIONS, TEAM_BALANCE_V1_FORMULA_VERSION } from "./team-balance";
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
  const fairness = candidate.score.fairness;
  const relaxation = fairness?.constraintRelaxation;
  const currentRules = Boolean(fairness) && candidate.score.v1?.formulaVersion === TEAM_BALANCE_V1_FORMULA_VERSION;
  const label = candidate.source === "MANUAL" ? "수동 조정안" : currentRules ? relaxation?.applied ? "조건을 조정한 최선 추천" : "내전 규칙 전체탐색 추천" : "이전 계산 결과";
  const status = fairness?.status === "INVALID" ? "필수 조건 위반" : currentRules && relaxation?.applied ? "조건 조정 편성" : currentRules && fairness ? { BALANCED: "균형 추천", CONDITIONAL: "조건부 편성", REVIEW_REQUIRED: "정보 확인 필요", INVALID: "필수 조건 위반" }[fairness.status] : "최신 기준 재평가 필요";
  const relaxationDetails = relaxation?.reasons.map((reason) => reason.detail) ?? [];
  const notes = fairness ? [...new Set([...fairness.hardViolations, ...fairness.warnings.filter((warning) => !relaxationDetails.some((detail) => warning === detail || warning.endsWith(`: ${detail}`))), ...formatTeamBalanceRelaxationReasons(candidate, participants)])].map((note) => {
    let safeNote = oneLine(note);
    for (const [playerId, name] of names) safeNote = safeNote.replaceAll(playerId, name || "참가자");
    return safeNote;
  }) : [];
  if (!currentRules) notes.unshift("이전 계산 결과입니다. 최신 자동 조정 기준으로 재평가해 주세요.");
  const strength = candidate.score.teamStrength;
  return `BLUE ${teamLine("BLUE")}\nRED ${teamLine("RED")}\n내전 규칙: ${status}${notes.length ? `\n주의: ${notes.join(" / ")}` : ""}\n밸런스 판단: ${label}\n팀 점수: RED ${strength.redTotal.toFixed(1)} / BLUE ${strength.blueTotal.toFixed(1)} / 차이 ${strength.difference.toFixed(1)}\n※ 점수 차이는 실제 승률을 뜻하지 않습니다.`;
}
