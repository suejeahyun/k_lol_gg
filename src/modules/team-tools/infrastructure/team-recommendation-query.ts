import type { TeamBalanceTeam } from "../domain/team-balance";
import type { TeamBalanceDraftListQuery } from "../application/ports/team-balance-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function single(input: Readonly<Record<string, string | string[] | undefined>>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value : value === undefined ? null : undefined;
}

function team(value: string | null | undefined): TeamBalanceTeam | null {
  if (value === null) return "RED";
  return value === "RED" || value === "BLUE" ? value : null;
}

function positiveInteger(value: string | null | undefined, fallback: number, maximum: number) {
  if (value === null) return fallback;
  if (value === undefined || !/^[1-9][0-9]{0,8}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export type TeamBalanceDraftsPageQuery =
  | Readonly<{ view: "drafts"; list: TeamBalanceDraftListQuery }>
  | Readonly<{ view: "recommendations"; draftId: string | null; team: TeamBalanceTeam }>;

export function parseTeamBalanceDraftsPageQuery(
  input: Readonly<Record<string, string | string[] | undefined>>,
): TeamBalanceDraftsPageQuery | null {
  const view = single(input, "view");
  if (view === "recommendations") {
    if (Object.keys(input).some((key) => !["view", "draftId", "team"].includes(key))) return null;
    const draftId = single(input, "draftId");
    const selectedTeam = team(single(input, "team"));
    if (draftId === undefined || (draftId !== null && !UUID.test(draftId)) || !selectedTeam) return null;
    return { view, draftId: draftId?.toLowerCase() ?? null, team: selectedTeam };
  }
  if (view !== null || Object.keys(input).some((key) => !["page", "pageSize"].includes(key))) return null;
  const page = positiveInteger(single(input, "page"), 1, 100);
  const pageSize = positiveInteger(single(input, "pageSize"), 12, 50);
  return page === null || pageSize === null ? null : { view: "drafts", list: { page, pageSize } };
}

export type TeamBalanceDraftDetailQuery =
  | Readonly<{ tab: "draft" }>
  | Readonly<{ tab: "recommendations"; team: TeamBalanceTeam }>;

export function parseTeamBalanceDraftDetailQuery(
  input: Readonly<Record<string, string | string[] | undefined>>,
): TeamBalanceDraftDetailQuery | null {
  if (Object.keys(input).length === 0) return { tab: "draft" };
  if (Object.keys(input).some((key) => !["tab", "team"].includes(key)) || single(input, "tab") !== "recommendations") return null;
  const selectedTeam = team(single(input, "team"));
  return selectedTeam ? { tab: "recommendations", team: selectedTeam } : null;
}

export function parseTeamBalanceRecommendationApiQuery(url: string): TeamBalanceTeam | null {
  const params = new URL(url).searchParams;
  if ([...params.keys()].some((key) => key !== "team") || params.getAll("team").length !== 1) return null;
  const selected = params.get("team");
  return selected === "RED" || selected === "BLUE" ? selected : null;
}
