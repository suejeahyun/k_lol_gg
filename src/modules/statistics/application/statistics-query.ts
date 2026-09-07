const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicStatisticsQuery = Readonly<{
  seasonId: string | null;
  minimumParticipation: number;
}>;

function single(searchParams: URLSearchParams, key: string): string | null | "INVALID" {
  const values = searchParams.getAll(key);
  if (values.length > 1) return "INVALID";
  return values[0] ?? null;
}

export function parsePublicStatisticsQuery(url: string): PublicStatisticsQuery | null {
  const searchParams = new URL(url).searchParams;
  if ([...searchParams.keys()].some((key) => key !== "seasonId" && key !== "minParticipation")) {
    return null;
  }
  const seasonId = single(searchParams, "seasonId");
  const minimum = single(searchParams, "minParticipation");
  if (seasonId === "INVALID" || minimum === "INVALID") return null;
  if (seasonId !== null && !uuidPattern.test(seasonId)) return null;
  if (minimum !== null && !/^(?:0|[1-9][0-9]{0,2})$/.test(minimum)) return null;
  const minimumParticipation = minimum === null ? 10 : Number(minimum);
  if (minimumParticipation > 999) return null;
  return { seasonId, minimumParticipation };
}

export function parsePlayerStatisticsQuery(url: string): Readonly<{ seasonId: string | null }> | null {
  const searchParams = new URL(url).searchParams;
  if ([...searchParams.keys()].some((key) => key !== "seasonId")) return null;
  const seasonId = single(searchParams, "seasonId");
  if (seasonId === "INVALID" || (seasonId !== null && !uuidPattern.test(seasonId))) return null;
  return { seasonId };
}

export function isStatisticsUuid(value: string): boolean {
  return uuidPattern.test(value);
}
