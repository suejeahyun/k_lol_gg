const DATA_DRAGON_HOST = "ddragon.leagueoflegends.com";
const DATA_DRAGON_PATH = /^\/cdn\/[0-9]+\.[0-9]+\.[0-9]+\/img\/champion\/[A-Za-z0-9]+\.png$/u;
const DATA_DRAGON_VERSION = "26.18.1";
const DATA_DRAGON_SLUG_OVERRIDES: Readonly<Record<string, string>> = {
  aurelionsol: "AurelionSol", belveth: "Belveth", chogath: "Chogath", drmundo: "DrMundo",
  jarvaniv: "JarvanIV", kaisa: "Kaisa", khazix: "Khazix", kogmaw: "KogMaw",
  leesin: "LeeSin", masteryi: "MasterYi", missfortune: "MissFortune", monkeyking: "MonkeyKing",
  reksai: "RekSai", renataglasc: "RenataGlasc", tahmkench: "TahmKench", twistedfate: "TwistedFate",
  velkoz: "Velkoz", xinzhao: "XinZhao",
};

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

/** Builds a trusted Riot Data Dragon fallback from the stored champion key only. */
export function officialChampionImageUrl(championKey: unknown): string | null {
  if (typeof championKey !== "string") return null;
  const key = championKey.normalize("NFKC").trim().toLowerCase();
  if (!/^[a-z0-9]+$/u.test(key)) return null;
  const slug = DATA_DRAGON_SLUG_OVERRIDES[key] ?? `${key.slice(0, 1).toUpperCase()}${key.slice(1)}`;
  return `https://${DATA_DRAGON_HOST}/cdn/${DATA_DRAGON_VERSION}/img/champion/${slug}.png`;
}

export function resolveChampionImageUrl(imageUrl: unknown, championKey: unknown): string | null {
  return normalizeChampionImageUrl(imageUrl) ?? officialChampionImageUrl(championKey);
}

export function championPortraitInitial(displayName: string) {
  const normalized = displayName.normalize("NFKC").trim();
  return Array.from(normalized)[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}
