import { compareCodeUnits, compareWinRateDescending, type PublicRankingRowDto } from "./season-statistics";

export const PUBLIC_RANKING_VIEWS = ["win-rate", "participation", "mvp"] as const;
export type PublicRankingView = (typeof PUBLIC_RANKING_VIEWS)[number];

export type PublicRankingViewDefinition = Readonly<{
  id: PublicRankingView;
  label: string;
  description: string;
  metricLabel: string;
  tieBreakDescription: string;
  metric: (row: PublicRankingRowDto) => string;
}>;

const compareNumber = (left: number, right: number) => right - left;

function compareRows(view: PublicRankingView, left: PublicRankingRowDto, right: PublicRankingRowDto) {
  const primary = view === "win-rate"
    ? compareWinRateDescending(left, right)
    : view === "participation"
      ? compareNumber(left.participationCount, right.participationCount)
      : compareNumber(left.mvpCount, right.mvpCount);
  if (primary) return primary;
  if (view !== "participation") {
    const participation = compareNumber(left.participationCount, right.participationCount);
    if (participation) return participation;
  }
  if (view !== "mvp") {
    const mvp = compareNumber(left.mvpCount, right.mvpCount);
    if (mvp) return mvp;
  }
  if (view !== "win-rate") {
    const winRate = compareWinRateDescending(left, right);
    if (winRate) return winRate;
  }
  return compareCodeUnits(left.playerId, right.playerId);
}

export const publicRankingViewDefinitions: readonly PublicRankingViewDefinition[] = [
  { id: "win-rate", label: "승률", description: "승률이 높은 순", metricLabel: "승률", tieBreakDescription: "동률이면 참여 횟수, MVP, 플레이어 ID 순으로 정합니다", metric: (row) => `${row.winRate}%` },
  { id: "participation", label: "최다 참여자", description: "참여 횟수가 많은 순", metricLabel: "참여", tieBreakDescription: "동률이면 MVP, 승률, 플레이어 ID 순으로 정합니다", metric: (row) => `${row.participationCount}회` },
  { id: "mvp", label: "최다 MVP", description: "MVP 선정 횟수가 많은 순", metricLabel: "MVP", tieBreakDescription: "동률이면 참여 횟수, 승률, 플레이어 ID 순으로 정합니다", metric: (row) => `${row.mvpCount}회` },
] as const;

export function isPublicRankingView(value: unknown): value is PublicRankingView {
  return typeof value === "string" && (PUBLIC_RANKING_VIEWS as readonly string[]).includes(value);
}

export function publicRankingViewDefinition(view: PublicRankingView): PublicRankingViewDefinition {
  return publicRankingViewDefinitions.find((definition) => definition.id === view) ?? publicRankingViewDefinitions[0]!;
}

export function buildPublicRankingView(
  rankings: readonly PublicRankingRowDto[],
  view: PublicRankingView,
): readonly PublicRankingRowDto[] {
  return rankings.slice().sort((left, right) => compareRows(view, left, right));
}

export function buildHomePublicRankingSummaries(rankings: readonly PublicRankingRowDto[]) {
  return publicRankingViewDefinitions.map((view) => ({
    ...view,
    rows: buildPublicRankingView(rankings, view.id).slice(0, 3),
  }));
}
