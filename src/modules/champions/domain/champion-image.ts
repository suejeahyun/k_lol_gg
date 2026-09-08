const DATA_DRAGON_HOST = "ddragon.leagueoflegends.com";
const DATA_DRAGON_PATH = /^\/cdn\/[0-9]+\.[0-9]+\.[0-9]+\/img\/champion\/[A-Za-z0-9]+\.png$/u;

/**
 * Keeps every public champion portrait on Riot's versioned Data Dragon image
 * origin. Query strings, credentials, ports and look-alike hosts are rejected.
 */
export function normalizeChampionImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 512) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== DATA_DRAGON_HOST ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      !DATA_DRAGON_PATH.test(url.pathname)
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function championPortraitInitial(displayName: string) {
  const normalized = displayName.normalize("NFKC").trim();
  return Array.from(normalized)[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}
