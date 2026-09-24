import type { RiotRecentSoloSummary } from "./recent-solo-summary";

export const RIOT_HISTORY_WINDOW_DAYS = 180;
export const RIOT_HISTORY_PAGE_SIZE = 40;
export type RiotPosition = RiotRecentSoloSummary["mainPosition"];
export type RiotMatchParticipantDto = Readonly<{
  participantId: number; teamId: number; riotId: string | null;
  championId: number; championName: string; position: RiotPosition; win: boolean;
  kills: number; deaths: number; assists: number; champLevel: number | null;
  cs: number | null; goldEarned: number | null; damageToChampions: number | null;
  damageTaken: number | null; visionScore: number | null; wardsPlaced: number | null;
  wardsKilled: number | null; controlWardsBought: number | null;
  items: readonly number[]; summonerSpells: readonly number[];
  runes: Readonly<{ primaryStyleId: number | null; secondaryStyleId: number | null; perkIds: readonly number[]; statPerks: readonly number[] }>;
  doubleKills: number | null; tripleKills: number | null; quadraKills: number | null;
  pentaKills: number | null; killingSprees: number | null; turretKills: number | null;
  turretPlatesTaken: number | null;
  inhibitorKills: number | null; objectivesStolen: number | null; damageToObjectives: number | null;
}>;
export type RiotMatchTeamDto = Readonly<{
  teamId: number; win: boolean;
  objectives: readonly Readonly<{ type: string; kills: number; first: boolean | null }>[];
  bans: readonly number[];
}>;
export type RiotTimelineParticipantDto = Readonly<{
  participantId: number; totalGold: number | null; cs: number | null;
  xp: number | null; level: number | null; x: number | null; y: number | null;
}>;
export type RiotTimelineEventDto = Readonly<{
  timestamp: number;
  type: "ITEM_PURCHASED" | "ITEM_SOLD" | "ITEM_DESTROYED" | "ITEM_UNDO" | "SKILL_LEVEL_UP" | "CHAMPION_KILL" | "ELITE_MONSTER_KILL" | "BUILDING_KILL";
  participantId: number | null; killerId: number | null; victimId: number | null;
  assistingParticipantIds: readonly number[];
  itemId: number | null; beforeId: number | null; afterId: number | null; skillSlot: number | null;
  monsterType: string | null; monsterSubType: string | null; buildingType: string | null;
  towerType: string | null; teamId: number | null; laneType: string | null;
  x: number | null; y: number | null;
}>;
export type RiotMatchTimelineDto = Readonly<{
  frameInterval: number;
  frames: readonly Readonly<{ timestamp: number; participants: readonly RiotTimelineParticipantDto[] }>[];
  events: readonly RiotTimelineEventDto[];
}>;
export type RiotTimelineSummaryDto = Readonly<{
  goldDiffAt10: number | null; csDiffAt10: number | null;
  goldDiffAt15: number | null; csDiffAt15: number | null; xpDiffAt15: number | null;
  earlyTakedowns: number | null;
}>;
/** Allowlisted match facts only: no PUUID, account IDs, tokens or raw provider payload. */
export type RiotMatchDto = Readonly<{
  matchId: string; startedAt: string; durationSeconds: number; queueId: number; mapId: number;
  gameVersion: string; selfParticipantId: number; remake: boolean;
  participants: readonly RiotMatchParticipantDto[]; teams: readonly RiotMatchTeamDto[];
  timeline: RiotMatchTimelineDto | null;
  timelineStatus: "PENDING" | "AVAILABLE" | "UNAVAILABLE";
  /** Public list optimization only; the single-match endpoint returns the full timeline. */
  timelineDeferred?: boolean;
  timelineSummary?: RiotTimelineSummaryDto;
}>;
export type RiotRankHistoryDto = Readonly<{
  date: string; tier: string | null; rank: string | null; leaguePoints: number | null;
  wins: number | null; losses: number | null; recordedAt: string;
}>;
export type RiotPlayerAnalyticsDto = Readonly<{
  matches: readonly RiotMatchDto[]; rankHistory: readonly RiotRankHistoryDto[];
  coverage: Readonly<{
    oldestMatchAt: string | null; newestMatchAt: string | null; collectedGames: number;
    historyComplete: boolean; historyWindowDays: 180;
  }>;
  updatedAt: string; nextCursor: string | null;
}>;
export type RiotAnalyticsCollection = Readonly<{
  matches: readonly RiotMatchDto[];
  historyBefore: number | null;
  historyComplete: boolean;
  partial: boolean;
  /** Drives the private successful-observation watermark, independently of timeline/backfill failures. */
  recentPageComplete?: boolean;
  recentSolo?: RiotRecentSoloSummary;
  retryAfterSeconds?: number;
}>;

export function riotHistoryStart(now: Date): Date {
  return new Date(now.getTime() - RIOT_HISTORY_WINDOW_DAYS * 86_400_000);
}

/** Same-position opponent at observed minute frames; missing/ambiguous lanes are not zero. */
export function summarizeRiotTimeline(match: RiotMatchDto): RiotTimelineSummaryDto {
  const empty = { goldDiffAt10: null, csDiffAt10: null, goldDiffAt15: null, csDiffAt15: null, xpDiffAt15: null, earlyTakedowns: null };
  if (!match.timeline) return empty;
  const self = match.participants.find((row) => row.participantId === match.selfParticipantId);
  const opponents = self?.position && match.mapId === 11 ? match.participants.filter((row) => row.teamId !== self.teamId && row.position === self.position) : [];
  const opponent = opponents.length === 1 ? opponents[0] : null;
  const delta = (minute: number, field: "totalGold" | "cs" | "xp") => {
    if (!self || !opponent || !match.timeline || !match.timeline.frames.some((frame) => frame.timestamp >= minute * 60_000)) return null;
    const frame = [...match.timeline.frames].reverse().find((frame) => frame.timestamp <= minute * 60_000 && frame.timestamp >= minute * 60_000 - 60_000);
    const own = frame?.participants.find((row) => row.participantId === self.participantId)?.[field];
    const other = frame?.participants.find((row) => row.participantId === opponent.participantId)?.[field];
    return typeof own === "number" && typeof other === "number" ? own - other : null;
  };
  return { goldDiffAt10: delta(10, "totalGold"), csDiffAt10: delta(10, "cs"), goldDiffAt15: delta(15, "totalGold"), csDiffAt15: delta(15, "cs"), xpDiffAt15: delta(15, "xp"),
    earlyTakedowns: match.timeline.events.filter((event) => event.type === "CHAMPION_KILL" && event.timestamp <= 15 * 60_000 &&
      (event.killerId === match.selfParticipantId || event.assistingParticipantIds.includes(match.selfParticipantId))).length };
}
