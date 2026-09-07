import type { DisciplineType } from "./policy";

export type PublicDisciplineSource = Readonly<{
  id: string;
  type: DisciplineType;
  active: boolean;
  createdAt: Date;
}>;

export type PublicDisciplineStatisticsDto = Readonly<{
  activeCautionCount: number;
  activeWarningCount: number;
  activeBanCount: number;
  resolvedCount: number;
  updatedAt: string | null;
}>;

/** Public output is aggregate-only: no identity, reason, evidence or operator fields. */
export function buildPublicDisciplineStatistics(
  records: readonly PublicDisciplineSource[],
): PublicDisciplineStatisticsDto {
  const latest = records
    .map((record) => record.createdAt)
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  return {
    activeCautionCount: records.filter((record) => record.active && record.type === "CAUTION").length,
    activeWarningCount: records.filter((record) => record.active && record.type === "WARNING").length,
    activeBanCount: records.filter((record) => record.active && record.type === "BAN").length,
    resolvedCount: records.filter((record) => !record.active).length,
    updatedAt: latest?.toISOString() ?? null,
  };
}
