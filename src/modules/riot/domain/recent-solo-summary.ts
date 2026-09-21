export const RECENT_SOLO_POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
export type RiotRecentSoloSummary = Readonly<{
  games: number;
  wins: number;
  kda: number | null;
  mainPosition: typeof RECENT_SOLO_POSITIONS[number] | null;
  subPosition: typeof RECENT_SOLO_POSITIONS[number] | null;
  positionConfidence: number;
  averageDamage: number | null;
  averageVisionScore: number | null;
}>;

type Sample = Readonly<{ win: boolean; kills: number; deaths: number; assists: number; damage: number; vision: number; position: RiotRecentSoloSummary["mainPosition"] }>;
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function count(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}
const positionMap: Readonly<Record<string, RiotRecentSoloSummary["mainPosition"]>> = {
  TOP: "TOP", JUNGLE: "JGL", MIDDLE: "MID", BOTTOM: "ADC", UTILITY: "SUP",
};

/** Inspect only the connected player's ranked solo row; raw match payloads are never persisted. */
export function recentSoloSample(value: unknown, matchId: string, puuid: string): Sample | "REMAKE" | null {
  const root = object(value);
  const info = object(root?.info);
  const metadata = object(root?.metadata);
  if (!info || metadata?.matchId !== matchId || info.queueId !== 420 || info.mapId !== 11 || !Array.isArray(info.participants) || info.participants.length !== 10) return null;
  const matches = info.participants.map(object).filter((row) => row?.puuid === puuid);
  if (matches.length !== 1 || !matches[0]) return null;
  const row = matches[0];
  if (row.gameEndedInEarlySurrender === true) return "REMAKE";
  if (typeof row.win !== "boolean" || !count(row.kills, 1_000) || !count(row.deaths, 1_000) || !count(row.assists, 1_000) || !count(row.totalDamageDealtToChampions, 10_000_000) || !count(row.visionScore, 10_000)) return null;
  return { win: row.win, kills: row.kills, deaths: row.deaths, assists: row.assists, damage: row.totalDamageDealtToChampions, vision: row.visionScore,
    position: typeof row.teamPosition === "string" ? positionMap[row.teamPosition] ?? null : null };
}

export function summarizeRecentSolo(samples: readonly Sample[]): RiotRecentSoloSummary {
  if (samples.length > 20) throw new RangeError("RECENT_SOLO_SAMPLE_LIMIT");
  const games = samples.length;
  const positions = RECENT_SOLO_POSITIONS.map((position) => ({ position, count: samples.filter((sample) => sample.position === position).length }))
    .filter((item) => item.count > 0).sort((left, right) => right.count - left.count);
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    games, wins: samples.filter((sample) => sample.win).length,
    kda: games ? round(samples.reduce((sum, sample) => sum + sample.kills + sample.assists, 0) / Math.max(1, samples.reduce((sum, sample) => sum + sample.deaths, 0))) : null,
    mainPosition: positions[0]?.position ?? null,
    subPosition: positions[1]?.position ?? null,
    positionConfidence: games ? round((positions[0]?.count ?? 0) / games) : 0,
    averageDamage: games ? round(samples.reduce((sum, sample) => sum + sample.damage, 0) / games) : null,
    averageVisionScore: games ? round(samples.reduce((sum, sample) => sum + sample.vision, 0) / games) : null,
  };
}

export function parseRecentSoloSummary(value: unknown): RiotRecentSoloSummary | null {
  const row = object(value);
  const keys = ["games", "wins", "kda", "mainPosition", "subPosition", "positionConfidence", "averageDamage", "averageVisionScore"];
  if (!row || Object.keys(row).length !== keys.length || Object.keys(row).some((key) => !keys.includes(key))) return null;
  if (!count(row.games, 20) || !count(row.wins, row.games)) return null;
  const optionalNumber = (value: unknown, maximum: number) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum);
  const position = (value: unknown) => value === null || RECENT_SOLO_POSITIONS.includes(value as typeof RECENT_SOLO_POSITIONS[number]);
  if (!optionalNumber(row.kda, 40_000) || !optionalNumber(row.averageDamage, 10_000_000) || !optionalNumber(row.averageVisionScore, 10_000) || !position(row.mainPosition) || !position(row.subPosition) || typeof row.positionConfidence !== "number" || !Number.isFinite(row.positionConfidence) || row.positionConfidence < 0 || row.positionConfidence > 1) return null;
  return row as RiotRecentSoloSummary;
}
