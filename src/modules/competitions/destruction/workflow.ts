import { COMPETITION_POSITIONS } from "../core/roster";
import { recalculateStandings } from "../core/standings";
import type { DestructionAggregate } from "./state";

export const DESTRUCTION_STEPS = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT", "COMPLETED"] as const;
export const DESTRUCTION_STATUS_LABEL = { PLANNED: "대회 준비", RECRUITING: "참가 모집", TEAM_BUILDING: "주장·포인트 확정", AUCTION: "선수 경매", PRELIMINARY: "예선", TOURNAMENT: "본선", COMPLETED: "종료", CANCELLED: "취소" } as const;
export const APPLICATION_STATUS_LABEL = { APPLIED: "심사 대기", CONFIRMED: "참가 확정", RESERVE: "예비 선수", REJECTED: "신청 거절", CANCELLED: "신청 취소" } as const;
export const DESTRUCTION_STAGE_HELP = {
  PLANNED: "운영자가 모집을 시작하면 참가 신청을 할 수 있습니다.",
  RECRUITING: "포지션별 모집 현황을 확인하고 참가 신청을 해 주세요.",
  TEAM_BUILDING: "참가자가 확정되었습니다. 주장과 팀별 경매 포인트를 준비하고 있습니다.",
  AUCTION: "선수를 추첨하고 운영자가 낙찰 결과를 확정합니다. 팀별 포인트와 로스터를 확인하세요.",
  PRELIMINARY: "확정된 경기 결과로 예선 순위를 계산합니다. 경기 참가자는 MVP에 투표해 주세요.",
  TOURNAMENT: "4강과 결승을 진행합니다. 경기 결과와 내 MVP 투표를 확인하세요.",
  COMPLETED: "모든 경기와 MVP가 확정되었습니다. 최종 결과와 대회 기록을 확인하세요.",
  CANCELLED: "대회가 취소되었습니다. 운영자가 복구하기 전까지 신청과 경기는 중단됩니다.",
} as const;

export function destructionRecruitment(aggregate: Pick<DestructionAggregate, "applications" | "configuration">) {
  return COMPETITION_POSITIONS.map((position) => ({
    position,
    applied: aggregate.applications.filter((entry) => entry.position === position && ["APPLIED", "CONFIRMED", "RESERVE"].includes(entry.status)).length,
    confirmed: aggregate.applications.filter((entry) => entry.position === position && entry.status === "CONFIRMED").length,
    limit: aggregate.configuration.laneLimits[position],
    required: aggregate.configuration.teamCount,
  }));
}

export function destructionStandings(aggregate: Pick<DestructionAggregate, "teams" | "preliminaryFixtures" | "configuration">) {
  if (aggregate.teams.length < 2 || aggregate.preliminaryFixtures.length === 0) return [];
  const groups = aggregate.configuration.preliminaryMode === "GROUP_ROUND_ROBIN"
    ? [...new Set(aggregate.preliminaryFixtures.map((fixture) => fixture.groupKey))]
    : [null];
  return groups.map((groupKey) => {
    const fixtures = aggregate.preliminaryFixtures.filter((fixture) => fixture.groupKey === groupKey);
    const teamIds = groupKey === null ? aggregate.teams.map((team) => team.id)
      : [...new Set(fixtures.flatMap((fixture) => [fixture.teamAId, fixture.teamBId]))];
    return { groupKey, rows: recalculateStandings({ teamIds, fixtures }).map((row) => ({ ...row, teamName: aggregate.teams.find((team) => team.id === row.teamId)?.name ?? "알 수 없는 팀" })) };
  });
}

/** A read model shared by the operating screen and command preflight. */
export function destructionReadiness(aggregate: DestructionAggregate) {
  const status = aggregate.lifecycle.status;
  const blockers: string[] = [];
  let action: string | null = null;
  let label = "대회 기록 확인";
  if (status === "PLANNED") { action = "START_RECRUITMENT"; label = "참가 모집 시작"; }
  if (status === "RECRUITING") {
    action = "CLOSE_RECRUITMENT"; label = "모집 마감·참가자 확정";
    for (const lane of destructionRecruitment(aggregate)) if (lane.confirmed !== lane.required) blockers.push(`${lane.position} 확정 ${lane.confirmed}/${lane.required}명: 포지션별 정확히 ${lane.required}명이 필요합니다.`);
  }
  if (status === "TEAM_BUILDING") {
    action = "START_AUCTION"; label = "경매 시작";
    if (["ARAM", "ARAM_MAYHEM"].includes(aggregate.configuration.gameMode ?? "CLASSIC") && aggregate.participants.some((p) => p.aramRecord?.mode !== aggregate.configuration.gameMode)) blockers.push("모든 참가자의 해당 모드 전적과 임시 등급을 준비해 주세요.");
    if (aggregate.teams.length !== aggregate.configuration.teamCount || !aggregate.auctionSeed) blockers.push("먼저 팀별 주장과 경매 포인트를 확정해 주세요.");
  }
  if (status === "AUCTION") {
    action = "PUBLISH_PRELIMINARY"; label = "팀 확정·예선 대진 공개";
    if (aggregate.auctionPaused) blockers.push("경매가 일시 중단되었습니다. 재개 후 진행해 주세요.");
    const remaining = aggregate.participants.filter((entry) => !["SOLD", "ASSIGNED"].includes(entry.auctionStatus)).length;
    if (remaining) blockers.push(`낙찰되지 않은 선수 ${remaining}명이 남아 있습니다.`);
    if (aggregate.teams.length !== aggregate.configuration.teamCount) blockers.push("설정된 팀 수와 편성된 팀 수가 다릅니다.");
    for (const team of aggregate.teams) {
      const roster = aggregate.participants.filter((entry) => entry.teamId === team.id);
      if (roster.length !== 5 || new Set(roster.map((entry) => entry.position)).size !== 5) blockers.push(`${team.name}: 포지션별 1명씩 총 5명이 필요합니다.`);
    }
  }
  if (status === "PRELIMINARY") {
    action = "PUBLISH_TOURNAMENT"; label = "상위 4팀 본선 공개";
    const remaining = aggregate.preliminaryFixtures.filter((fixture) => fixture.status !== "COMPLETED" || !fixture.confirmed).length;
    if (!aggregate.preliminaryFixtures.length || remaining) blockers.push(`예선 ${remaining || "전체"}경기의 결과 확정이 필요합니다.`);
  }
  if (status === "TOURNAMENT") {
    action = "COMPLETE_DESTRUCTION"; label = "최종 결과 확정·대회 종료";
    if (!aggregate.tournamentBracket?.championTeamId) blockers.push("결승 결과를 먼저 확정해 주세요.");
    const played = [...aggregate.preliminaryFixtures.filter((f) => f.status === "COMPLETED"), ...(aggregate.tournamentBracket?.fixtures.filter((f) => f.resolution === "RESULT") ?? [])];
    const missing = played.filter((fixture) => !aggregate.mvpBallots.some((ballot) => ballot.fixtureId === fixture.id && ballot.finalizedPlayerId));
    if (missing.length) blockers.push(`MVP가 확정되지 않은 경기가 ${missing.length}개 있습니다.`);
  }
  if (status === "CANCELLED") { action = "RESTORE_DESTRUCTION"; label = "취소 전 단계로 복구"; }
  return { action, label, blockers, ready: action !== null && blockers.length === 0 };
}

export function destructionCorrectionImpact(aggregate: DestructionAggregate, fixtureId: string, winnerTeamId: string) {
  if (aggregate.preliminaryFixtures.some((fixture) => fixture.id === fixtureId)) return {
    fixtureIds: aggregate.tournamentBracket?.fixtures.map((fixture) => fixture.id) ?? [],
    resetsTournament: aggregate.tournamentBracket !== null,
  };
  const bracket = aggregate.tournamentBracket;
  const target = bracket?.fixtures.find((fixture) => fixture.id === fixtureId);
  const ids = new Set<string>();
  if (target?.winnerTeamId !== winnerTeamId) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const fixture of bracket?.fixtures ?? []) {
        if (!ids.has(fixture.id) && [fixture.sourceA, fixture.sourceB].some((source) => source.kind === "WINNER" && (source.sourceFixtureId === fixtureId || ids.has(source.sourceFixtureId)))) {
          ids.add(fixture.id); changed = true;
        }
      }
    }
  }
  return { fixtureIds: [...ids], resetsTournament: false };
}
