const allowedTypes = new Set(["season", "event", "destruction"]);
const allowedSources = new Set(["pwa", "bookmark", "kakao"]);

function singleAllowed(values: readonly string[], allowed: ReadonlySet<string>): string | null {
  if (values.length !== 1) return null;
  const value = values[0]?.trim().toLocaleLowerCase("en-US") ?? "";
  return allowed.has(value) ? value : null;
}

export function buildLegacyApplicationsDestination(input: {
  source: readonly string[];
  type: readonly string[];
}) {
  const params = new URLSearchParams();
  const type = singleAllowed(input.type, allowedTypes);
  const source = singleAllowed(input.source, allowedSources);
  if (type) params.set("type", type);
  if (source) params.set("source", source);
  const query = params.toString();
  return query ? `/applications?${query}` : "/applications";
}

export function buildLegacySeasonApplicationDestination(input: { source: readonly string[] }) {
  const params = new URLSearchParams({ type: "season" });
  const source = singleAllowed(input.source, allowedSources);
  if (source) params.set("source", source);
  return `/applications?${params.toString()}`;
}
