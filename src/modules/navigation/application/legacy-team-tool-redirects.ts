type LegacyTeamToolQueryValue = string | readonly string[] | undefined;

type LegacyTeamToolSearchParams = Readonly<Record<string, LegacyTeamToolQueryValue>>;

function single(value: LegacyTeamToolQueryValue): string | undefined {
  return typeof value === "string" ? value : value?.length === 1 ? value[0] : undefined;
}

function appendReviewedSource(destination: URL, value: LegacyTeamToolQueryValue) {
  if (single(value) === "pwa") destination.searchParams.set("source", "pwa");
}

export function buildLegacyRandomTeamDestination(
  searchParams: LegacyTeamToolSearchParams,
): string {
  const destination = new URL("https://v2.invalid/tools/random-team");
  const mode = single(searchParams.mode);

  if (mode === "random" || mode === "tier") destination.searchParams.set("mode", mode);
  appendReviewedSource(destination, searchParams.source);

  return `${destination.pathname}${destination.search}`;
}

export function buildLegacyCoinTossDestination(
  searchParams: LegacyTeamToolSearchParams,
): string {
  const destination = new URL("https://v2.invalid/tools/coin-toss");
  appendReviewedSource(destination, searchParams.source);
  return `${destination.pathname}${destination.search}`;
}

export function buildLegacyTeamBalanceDestination(searchParams: LegacyTeamToolSearchParams): string {
  const destination = new URL("https://v2.invalid/tools/team-balance");
  appendReviewedSource(destination, searchParams.source);
  return `${destination.pathname}${destination.search}`;
}

export function buildLegacyTeamBalanceDraftDestination(
  draftId: string,
  searchParams: LegacyTeamToolSearchParams,
): string {
  const normalizedDraftId = draftId.toLocaleLowerCase("en-US");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalizedDraftId)) {
    return buildLegacyTeamBalanceDestination(searchParams);
  }
  const destination = new URL(`https://v2.invalid/tools/team-balance/drafts/${normalizedDraftId}`);
  appendReviewedSource(destination, searchParams.source);
  return `${destination.pathname}${destination.search}`;
}
