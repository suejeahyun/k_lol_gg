import {
  MATCH_SERIES_STATUSES,
  parseMatchRecordInput,
  type MatchGameInput,
  type MatchSeriesStatus,
} from "@/modules/matches/domain/match";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function zonedStartedAtFromStoredInstant(
  iso: string | null,
  offsetMinutes: number | null,
) {
  if (iso === null && offsetMinutes === null) return null;
  if (
    typeof iso !== "string" ||
    !Number.isFinite(new Date(iso).getTime()) ||
    !Number.isInteger(offsetMinutes) ||
    Number(offsetMinutes) < -840 ||
    Number(offsetMinutes) > 840
  ) return null;
  const local = new Date(new Date(iso).getTime() + Number(offsetMinutes) * 60_000)
    .toISOString()
    .slice(0, 19);
  if (offsetMinutes === 0) return `${local}Z`;
  const sign = Number(offsetMinutes) < 0 ? "-" : "+";
  const absolute = Math.abs(Number(offsetMinutes));
  return `${local}${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export type LatestAdminMatchProjection = Readonly<{
  id: string;
  status: MatchSeriesStatus;
  revision: number;
  body: Readonly<{
    seasonId: string;
    title: string;
    playedOn: string;
    startedAt: string | null;
    games: readonly MatchGameInput[];
  }>;
}>;

/** Parses only the aggregate fields needed to reconcile an administrator edit conflict. */
export function parseLatestAdminMatchProjection(value: unknown): LatestAdminMatchProjection | null {
  if (!record(value) || !record(value.match)) return null;
  const match = value.match;
  if (
    typeof match.id !== "string" ||
    !UUID_PATTERN.test(match.id) ||
    !MATCH_SERIES_STATUSES.includes(match.status as MatchSeriesStatus) ||
    !Number.isSafeInteger(match.revision) ||
    Number(match.revision) < 0 ||
    !(match.startedAt === null || typeof match.startedAt === "string") ||
    !(match.startedAtOffsetMinutes === null || Number.isInteger(match.startedAtOffsetMinutes)) ||
    ((match.startedAt === null) !== (match.startedAtOffsetMinutes === null))
  ) return null;
  const startedAt = zonedStartedAtFromStoredInstant(
    match.startedAt as string | null,
    match.startedAtOffsetMinutes as number | null,
  );
  if (match.startedAt !== null && startedAt === null) return null;
  const aggregate = parseMatchRecordInput({
    seasonId: match.seasonId,
    title: match.title,
    playedOn: match.playedOn,
    startedAt,
    games: match.games,
  });
  if (!aggregate) return null;
  return {
    id: match.id,
    status: match.status as MatchSeriesStatus,
    revision: Number(match.revision),
    body: {
      seasonId: aggregate.seasonId,
      title: aggregate.title,
      playedOn: aggregate.playedOn,
      startedAt,
      games: aggregate.games,
    },
  };
}
