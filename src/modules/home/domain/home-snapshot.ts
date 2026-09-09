import {
  findHomeGuideChampion,
  type HomeGuideTone,
} from "./home-guide-champions";

export type HomeRecentMatch = Readonly<{
  id: string;
  title: string;
  playedOn: string;
  blueWins: number;
  redWins: number;
  occurredAt: string;
}>;

export type HomeRecruit = Readonly<{
  id: string;
  kind: "PARTY" | "SCRIM";
  title: string;
  status: string;
  summary: string;
  occurredAt: string;
}>;

export type HomeCompetition = Readonly<{
  id: string;
  kind: "EVENT" | "DESTRUCTION";
  title: string;
  status: string;
  participantCount: number;
  occurredAt: string;
}>;

export type HomeGallery = Readonly<{
  id: string;
  title: string;
  description: string;
  publishedAt: string;
}>;

export type HomeActiveSeason = Readonly<{
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type HomeSnapshot = Readonly<{
  activePlayerCount: number;
  activeSeasonCount: number;
  publishedMatchCount: number;
  activeSeason: HomeActiveSeason | null;
  feeds: Readonly<{
    recentMatches: readonly HomeRecentMatch[];
    recruits: readonly HomeRecruit[];
    competitions: readonly HomeCompetition[];
    gallery: readonly HomeGallery[];
  }>;
}>;

export function mergeRecentHomeItems<T extends Readonly<{ id: string; occurredAt: string }>>(
  groups: readonly (readonly T[])[],
  limit: number,
): readonly T[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("HOME_FEED_LIMIT_INVALID");
  return groups.flat().slice().sort((left, right) => {
    const byTime = right.occurredAt.localeCompare(left.occurredAt);
    return byTime || left.id.localeCompare(right.id);
  }).slice(0, limit);
}

export type HomeSnapshotResult =
  | Readonly<{ state: "ready"; snapshot: HomeSnapshot }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;

export type HomeChampionCandidate = Readonly<{
  key: string;
  displayName: string;
  imageUrl: string | null;
}>;

export type HomeDailyChampionSelection = Readonly<{
  dateKey: string;
  champion: HomeChampionCandidate | null;
}>;

export type HomeChampionPresentation = Readonly<{
  message: string;
  localImageSrc: string | null;
  localImageAlt: string | null;
  tone: HomeGuideTone;
}>;

const dayMilliseconds = 86_400_000;

function simpleHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function kstHomeDateKey(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new TypeError("HOME_DAILY_CHAMPION_DATE_INVALID");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export function selectDailyHomeChampion(
  champions: readonly HomeChampionCandidate[],
  dateKey: string,
): HomeDailyChampionSelection {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dateKey)) {
    throw new TypeError("HOME_DAILY_CHAMPION_DATE_KEY_INVALID");
  }
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  const epoch = Date.UTC(year, month - 1, day);
  if (new Date(epoch).toISOString().slice(0, 10) !== dateKey) {
    throw new TypeError("HOME_DAILY_CHAMPION_DATE_KEY_INVALID");
  }

  const unique = new Map<string, HomeChampionCandidate>();
  for (const champion of champions) {
    const profile = findHomeGuideChampion(champion.key, champion.displayName);
    if (!profile) continue;
    const previous = unique.get(profile.id);
    if (!previous || champion.key.localeCompare(previous.key, "en-US") < 0) {
      unique.set(profile.id, champion);
    }
  }
  const ordered = [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([, champion]) => champion);
  if (ordered.length === 0) return { dateKey, champion: null };

  const epochDay = Math.floor(epoch / dayMilliseconds);
  return {
    dateKey,
    champion: ordered[(epochDay + 17) % ordered.length] ?? null,
  };
}

export function homeChampionPresentation(champion: HomeChampionCandidate): HomeChampionPresentation {
  const known = findHomeGuideChampion(champion.key, champion.displayName);
  if (known) {
    return {
      message: known.message,
      localImageSrc: known.overlayImageSrc,
      localImageAlt: null,
      tone: known.tone,
    };
  }

  const messages = [
    `${champion.displayName}와 함께 오늘의 첫 경기를 열어 봐요.`,
    `오늘은 ${champion.displayName}처럼 멋진 호흡을 맞춰 봐요.`,
    `${champion.displayName}와 기분 좋은 내전 한 판, 어때요?`,
    `${champion.displayName}의 응원을 받아 오늘도 즐겁게 플레이해요.`,
  ] as const;
  const tones = ["sky", "lilac", "peach", "mint"] as const;
  const index = simpleHash(champion.key) % messages.length;
  return {
    message: messages[index] ?? messages[0],
    localImageSrc: null,
    localImageAlt: null,
    tone: tones[index] ?? "sky",
  };
}
