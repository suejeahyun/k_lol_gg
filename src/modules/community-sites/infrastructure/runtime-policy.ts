export function isCommunitySitesEnabled(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return environment.NEXT_PUBLIC_SERVICE_ID === "hub" && environment.COMMUNITY_SITES_ENABLED === "true";
}
