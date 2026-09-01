import {
  SEASON_APPLICATION_POSITIONS,
  type SeasonApplicationPosition,
} from "../domain/season";

export function availableApplicationSubPositions(
  mainPosition: SeasonApplicationPosition,
): readonly SeasonApplicationPosition[] {
  if (mainPosition === "ALL") return [];
  return SEASON_APPLICATION_POSITIONS.filter(
    (position) => position !== "ALL" && position !== mainPosition,
  );
}

export function reconcileApplicationSubPositions(
  mainPosition: SeasonApplicationPosition,
  subPositions: readonly SeasonApplicationPosition[],
): SeasonApplicationPosition[] {
  const allowed = new Set(availableApplicationSubPositions(mainPosition));
  return [...new Set(subPositions)].filter((position) => allowed.has(position));
}
