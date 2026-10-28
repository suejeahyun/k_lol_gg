export function isCommunityNetworkEnabled(environment: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return environment.COMMUNITY_NETWORK_ENABLED === "true";
}
