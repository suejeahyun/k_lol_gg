const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one(values: readonly string[] | undefined): string | null {
  return values?.length === 1 ? values[0] ?? null : null;
}

export function buildLegacyStatisticsDestination(input: Readonly<{
  seasonId?: readonly string[];
  minParticipation?: readonly string[];
}>): string {
  const params = new URLSearchParams();
  const seasonId = one(input.seasonId);
  const minimum = one(input.minParticipation);
  if (seasonId && uuidPattern.test(seasonId)) params.set("seasonId", seasonId);
  if (minimum && /^(?:0|[1-9][0-9]{0,2})$/.test(minimum) && Number(minimum) <= 999) {
    params.set("minParticipation", minimum);
  }
  const query = params.toString();
  return query ? `/rankings?${query}` : "/rankings";
}
