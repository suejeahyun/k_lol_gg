export type CompetitionPlayerOption = Readonly<{
  value: string;
  label: string;
  status: "ACTIVE" | "INACTIVE";
}>;

export function competitionPlayerLabel(
  catalog: ReadonlyMap<string, string>,
  playerId: string,
) {
  return catalog.get(playerId) ?? "알 수 없는 선수";
}

export function competitionTeamLabel(
  teams: readonly Readonly<{ id: string; name: string }>[],
  teamId: string | null,
) {
  if (teamId === null) return "미정";
  return teams.find((team) => team.id === teamId)?.name ?? "알 수 없는 팀";
}

const positionLabels: Readonly<Record<string, string>> = Object.freeze({
  TOP: "탑",
  JGL: "정글",
  MID: "미드",
  ADC: "원거리 딜러",
  SUP: "서포터",
  ARAM: "칼바람",
});

const eventFormatLabels: Readonly<Record<string, string>> = Object.freeze({
  POSITION: "포지션 드래프트",
  POSITIONAL: "포지션 드래프트",
  ARAM: "칼바람",
});

const preliminaryFormatLabels: Readonly<Record<string, string>> = Object.freeze({
  FULL_ROUND_ROBIN_BO3: "전체 풀리그 · 3판 2선승",
  FULL_ROUND_ROBIN_BO1: "전체 풀리그 · 단판",
  GROUP_ROUND_ROBIN_BO3: "조별 풀리그 · 3판 2선승",
  GROUP_ROUND_ROBIN_BO1: "조별 풀리그 · 단판",
  SWISS_ROUND_BO3: "스위스 라운드 · 3판 2선승",
  SWISS_ROUND_BO1: "스위스 라운드 · 단판",
  RANDOM_ROUNDS_BO3: "랜덤 라운드 · 3판 2선승",
  RANDOM_ROUNDS_BO1: "랜덤 라운드 · 단판",
});

const bracketStageLabels: Readonly<Record<string, string>> = Object.freeze({
  ROUND_OF_32: "32강",
  ROUND_OF_16: "16강",
  QUARTER_FINAL: "8강",
  SEMI_FINAL: "준결승",
  FINAL: "결승",
});

export function competitionPositionLabel(position: string | null) {
  if (position === null) return "칼바람";
  return positionLabels[position] ?? "포지션 미정";
}

export function competitionEventFormatLabel(format: string) {
  return eventFormatLabels[format] ?? "경기 방식 미정";
}

export function competitionPreliminaryFormatLabel(format: string) {
  return preliminaryFormatLabels[format] ?? "예선 방식 미정";
}

export function competitionBracketStageLabel(stage: string) {
  return bracketStageLabels[stage] ?? "대진 단계 미정";
}
