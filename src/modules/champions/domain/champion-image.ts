import {
  DATA_DRAGON_CHAMPIONS,
  DATA_DRAGON_VERSION,
  type DataDragonChampion,
} from "./data-dragon-catalog";

const DATA_DRAGON_HOST = "ddragon.leagueoflegends.com";
const DATA_DRAGON_PATH = /^\/cdn\/[0-9]+\.[0-9]+\.[0-9]+\/img\/champion\/[A-Za-z0-9]+\.png$/u;

function championLookupKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s._'-]+/gu, "");
  return normalized || null;
}

const dataDragonChampionByLookup = new Map<string, DataDragonChampion>();

for (const champion of DATA_DRAGON_CHAMPIONS) {
  for (const value of [champion.riotKey, champion.id, champion.name]) {
    const lookup = championLookupKey(value);
    const existing = lookup ? dataDragonChampionByLookup.get(lookup) : null;
    if (!lookup) throw new Error("INVALID_DATA_DRAGON_CHAMPION_LOOKUP");
    if (existing && existing.id !== champion.id) {
      throw new Error("AMBIGUOUS_DATA_DRAGON_CHAMPION_LOOKUP");
    }
    dataDragonChampionByLookup.set(lookup, champion);
  }
}

const legacyChampionAliases: Readonly<Record<string, string>> = {
  nunuandwillump: "Nunu",
  renataglasc: "Renata",
  wukong: "MonkeyKing",
};

for (const [alias, officialId] of Object.entries(legacyChampionAliases)) {
  const champion = dataDragonChampionByLookup.get(championLookupKey(officialId) ?? "");
  if (!champion) throw new Error("INVALID_DATA_DRAGON_CHAMPION_ALIAS");
  dataDragonChampionByLookup.set(alias, champion);
}

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

export function findDataDragonChampion(
  championKey: unknown,
  displayName?: unknown,
): DataDragonChampion | null {
  for (const value of [championKey, displayName]) {
    const lookup = championLookupKey(value);
    const champion = lookup ? dataDragonChampionByLookup.get(lookup) : null;
    if (champion) return champion;
  }
  return null;
}

/** Builds a trusted Riot URL only when the champion exists in the pinned official catalog. */
export function officialChampionImageUrl(
  championKey: unknown,
  displayName?: unknown,
): string | null {
  const champion = findDataDragonChampion(championKey, displayName);
  return champion
    ? `https://${DATA_DRAGON_HOST}/cdn/${DATA_DRAGON_VERSION}/img/champion/${champion.id}.png`
    : null;
}

/** Official identity, validated stored URL, then the component's text fallback. */
export function championImageCandidates(
  imageUrl: unknown,
  championKey: unknown,
  displayName?: unknown,
): readonly string[] {
  const candidates = [
    officialChampionImageUrl(championKey, displayName),
    normalizeChampionImageUrl(imageUrl),
  ].filter((candidate): candidate is string => candidate !== null);
  return Object.freeze([...new Set(candidates)]);
}

export function resolveChampionImageUrl(
  imageUrl: unknown,
  championKey: unknown,
  displayName?: unknown,
): string | null {
  return championImageCandidates(imageUrl, championKey, displayName)[0] ?? null;
}

export function championPortraitInitial(displayName: string) {
  const normalized = displayName.normalize("NFKC").trim();
  return Array.from(normalized)[0]?.toLocaleUpperCase("ko-KR") ?? "?";
}
