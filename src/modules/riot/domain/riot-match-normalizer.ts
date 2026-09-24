import type { RiotMatchDto, RiotMatchParticipantDto, RiotMatchTimelineDto, RiotTimelineEventDto } from "./riot-player-analytics";

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const integer = (value: unknown, maximum = 10_000_000): number | null => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum ? Number(value) : null;
const text = (value: unknown, maximum: number): string | null => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
const positions: Readonly<Record<string, RiotMatchParticipantDto["position"]>> = { TOP: "TOP", JUNGLE: "JGL", MIDDLE: "MID", BOTTOM: "ADC", UTILITY: "SUP" };
export const RIOT_MATCH_ID_PATTERN = /^[A-Z0-9]{2,8}_[0-9]{1,20}$/u;
// Current public LoL queues from Riot's official docs/lol/queues.json. Custom,
// tournament custom, tutorial, TFT, Swarm and unknown future queues fail closed.
const publicQueues = new Set([400, 420, 430, 440, 450, 480, 490, 700, 720, 870, 880, 890, 900, 1020, 1300, 1400, 1700, 1710, 1900, 2300, 2400]);
function publicMatch(info: Record<string, unknown>): boolean {
  return publicQueues.has(Number(info.queueId)) && info.gameType === "MATCHED_GAME" && info.gameMode !== "PRACTICETOOL" && info.gameMode !== "TUTORIAL";
}

/** Known exclusions may advance an archive cursor; malformed ordinary matches may not. */
export function excludedRiotMatchStartedAt(value: unknown, matchId: string, puuid: string): number | null {
  const root = object(value), metadata = object(root?.metadata), info = object(root?.info);
  if (metadata?.matchId !== matchId || !RIOT_MATCH_ID_PATTERN.test(matchId) || !info || !Array.isArray(info.participants) ||
    info.participants.map(object).filter((row) => row?.puuid === puuid).length !== 1) return null;
  const excludedQueue = integer(info.queueId, 10_000) !== null && !publicQueues.has(Number(info.queueId));
  const excludedType = typeof info.gameType === "string" && info.gameType !== "MATCHED_GAME";
  const excludedMode = info.gameMode === "PRACTICETOOL" || info.gameMode === "TUTORIAL";
  if (!excludedQueue && !excludedType && !excludedMode && info.endOfGameResult !== "Abort_Unexpected" && info.participants.length >= 2 && info.participants.length <= 16) return null;
  return integer(info.gameStartTimestamp ?? info.gameCreation, 9_000_000_000_000);
}

function participant(value: unknown): RiotMatchParticipantDto | null {
  const row = object(value);
  if (!row) return null;
  const participantId = integer(row.participantId, 16), teamId = integer(row.teamId, 1_000), championId = integer(row.championId, 100_000);
  const championName = text(row.championName, 50), kills = integer(row.kills, 1_000), deaths = integer(row.deaths, 1_000), assists = integer(row.assists, 1_000);
  if (!participantId || !teamId || !championId || !championName || kills === null || deaths === null || assists === null || typeof row.win !== "boolean") return null;
  const gameName = text(row.riotIdGameName, 16), tagLine = text(row.riotIdTagline, 5);
  const perks = object(row.perks);
  const challenges = object(row.challenges);
  const styles = Array.isArray(perks?.styles) ? perks.styles.map(object).filter((style) => style !== null).slice(0, 2) : [];
  const perkIds = styles.flatMap((style) => Array.isArray(style.selections) ? style.selections.slice(0, 6).map(object).map((item) => integer(item?.perk, 100_000)).filter((id): id is number => id !== null) : []);
  const statPerks = object(perks?.statPerks);
  const minions = integer(row.totalMinionsKilled), jungle = integer(row.neutralMinionsKilled);
  const items = Array.from({ length: 7 }, (_, index) => integer(row[`item${index}`], 1_000_000));
  const spells = [integer(row.summoner1Id, 100_000), integer(row.summoner2Id, 100_000)];
  return {
    participantId, teamId, championId, championName, riotId: gameName && tagLine ? `${gameName}#${tagLine}` : null,
    position: typeof row.teamPosition === "string" ? positions[row.teamPosition] ?? null : null,
    win: row.win, kills, deaths, assists, champLevel: integer(row.champLevel, 100),
    cs: minions !== null && jungle !== null ? minions + jungle : null,
    goldEarned: integer(row.goldEarned), damageToChampions: integer(row.totalDamageDealtToChampions),
    damageTaken: integer(row.totalDamageTaken), visionScore: integer(row.visionScore, 10_000),
    wardsPlaced: integer(row.wardsPlaced, 10_000), wardsKilled: integer(row.wardsKilled, 10_000), controlWardsBought: integer(row.visionWardsBoughtInGame, 10_000),
    items: items.every((id): id is number => id !== null) ? items : [],
    summonerSpells: spells.every((id): id is number => id !== null) ? spells : [],
    runes: { primaryStyleId: integer(styles[0]?.style, 100_000), secondaryStyleId: integer(styles[1]?.style, 100_000), perkIds,
      statPerks: [statPerks?.offense, statPerks?.flex, statPerks?.defense].map((id) => integer(id, 100_000)).filter((id): id is number => id !== null) },
    doubleKills: integer(row.doubleKills, 1_000), tripleKills: integer(row.tripleKills, 1_000), quadraKills: integer(row.quadraKills, 1_000),
    pentaKills: integer(row.pentaKills, 1_000), killingSprees: integer(row.killingSprees, 1_000), turretKills: integer(row.turretKills, 100),
    turretPlatesTaken: integer(challenges?.turretPlatesTaken),
    inhibitorKills: integer(row.inhibitorKills, 100), objectivesStolen: integer(row.objectivesStolen, 100), damageToObjectives: integer(row.damageDealtToObjectives),
  };
}

/** Resolve the connected player's row once, then discard every provider identity field. */
export function normalizeRiotMatch(value: unknown, matchId: string, puuid: string): RiotMatchDto | null {
  const root = object(value), metadata = object(root?.metadata), info = object(root?.info);
  if (!RIOT_MATCH_ID_PATTERN.test(matchId) || metadata?.matchId !== matchId || !info || !publicMatch(info) || info.endOfGameResult === "Abort_Unexpected" || !Array.isArray(info.participants) || info.participants.length < 2 || info.participants.length > 16) return null;
  const selfRows = info.participants.map(object).filter((row) => row?.puuid === puuid);
  if (selfRows.length !== 1) return null;
  const selfParticipantId = integer(selfRows[0]?.participantId, 16);
  const queueId = integer(info.queueId, 10_000), mapId = integer(info.mapId, 1_000), durationSeconds = integer(info.gameDuration, 14_400);
  const startedAt = integer(info.gameStartTimestamp ?? info.gameCreation, 9_000_000_000_000);
  const gameVersion = text(info.gameVersion, 40);
  const participants = info.participants.map(participant);
  if (!selfParticipantId || queueId === null || mapId === null || durationSeconds === null || !startedAt || !gameVersion || !participants.every((row): row is RiotMatchParticipantDto => row !== null) || new Set(participants.map((row) => row.participantId)).size !== participants.length) return null;
  const teams = Array.isArray(info.teams) ? info.teams.slice(0, 8).map(object).flatMap((row) => {
    const teamId = integer(row?.teamId, 1_000);
    if (!row || !teamId || typeof row.win !== "boolean") return [];
    const objectives = object(row.objectives);
    return [{ teamId, win: row.win,
      objectives: ["baron", "champion", "dragon", "horde", "atakhan", "inhibitor", "riftHerald", "tower"].flatMap((type) => {
        const item = object(objectives?.[type]), kills = integer(item?.kills, 10_000);
        return kills === null ? [] : [{ type, kills, first: typeof item?.first === "boolean" ? item.first : null }];
      }),
      bans: Array.isArray(row.bans) ? row.bans.slice(0, 16).map(object).map((ban) => integer(ban?.championId, 100_000)).filter((id): id is number => id !== null) : [],
    }];
  }) : [];
  return { matchId, startedAt: new Date(startedAt).toISOString(), durationSeconds, queueId, mapId, gameVersion, selfParticipantId,
    remake: selfRows[0]?.gameEndedInEarlySurrender === true, participants, teams, timeline: null, timelineStatus: "PENDING" };
}

const eventTypes = new Set(["ITEM_PURCHASED", "ITEM_SOLD", "ITEM_DESTROYED", "ITEM_UNDO", "SKILL_LEVEL_UP", "CHAMPION_KILL", "ELITE_MONSTER_KILL", "BUILDING_KILL"]);
function timelineEvent(value: unknown): RiotTimelineEventDto | null {
  const row = object(value);
  if (!row || typeof row.type !== "string" || !eventTypes.has(row.type)) return null;
  const timestamp = integer(row.timestamp, 14_400_000);
  if (timestamp === null) return null;
  const position = object(row.position);
  const safeEnum = (value: unknown) => typeof value === "string" && /^[A-Z0-9_]{1,48}$/u.test(value) ? value : null;
  return { timestamp, type: row.type as RiotTimelineEventDto["type"],
    participantId: integer(row.participantId, 16), killerId: integer(row.killerId, 16), victimId: integer(row.victimId, 16),
    assistingParticipantIds: Array.isArray(row.assistingParticipantIds) ? row.assistingParticipantIds.slice(0, 16).map((id) => integer(id, 16)).filter((id): id is number => id !== null) : [],
    itemId: integer(row.itemId, 1_000_000), beforeId: integer(row.beforeId, 1_000_000), afterId: integer(row.afterId, 1_000_000), skillSlot: integer(row.skillSlot, 4) || null,
    monsterType: safeEnum(row.monsterType), monsterSubType: safeEnum(row.monsterSubType), buildingType: safeEnum(row.buildingType),
    towerType: safeEnum(row.towerType), teamId: integer(row.teamId, 1_000), laneType: safeEnum(row.laneType), x: integer(position?.x, 100_000), y: integer(position?.y, 100_000) };
}

export function normalizeRiotTimeline(value: unknown, match: RiotMatchDto): RiotMatchTimelineDto | null {
  const root = object(value), metadata = object(root?.metadata), info = object(root?.info);
  if (metadata?.matchId !== match.matchId || !info || !Array.isArray(info.frames) || info.frames.length < 1 || info.frames.length > 241) return null;
  const frameInterval = integer(info.frameInterval, 300_000);
  if (!frameInterval) return null;
  const ids = new Set(match.participants.map((row) => row.participantId));
  const events: RiotTimelineEventDto[] = [];
  const frames: RiotMatchTimelineDto["frames"][number][] = [];
  let timestampEventCounts = new Map<string, number>();
  for (const raw of info.frames) {
    const frame = object(raw), timestamp = integer(frame?.timestamp, 14_400_000), rows = object(frame?.participantFrames);
    if (!frame || timestamp === null || !rows || Object.keys(rows).length !== ids.size) return null;
    const participants = Object.values(rows).map(object).flatMap((row) => {
      const participantId = integer(row?.participantId, 16);
      if (!row || !participantId || !ids.has(participantId)) return [];
      const minions = integer(row.minionsKilled), jungle = integer(row.jungleMinionsKilled), position = object(row.position);
      return [{ participantId, totalGold: integer(row.totalGold), cs: minions !== null && jungle !== null ? minions + jungle : null,
        xp: integer(row.xp), level: integer(row.level, 100), x: integer(position?.x, 100_000), y: integer(position?.y, 100_000) }];
    });
    if (new Set(participants.map((row) => row.participantId)).size !== ids.size) return null;
    participants.sort((a, b) => a.participantId - b.participantId);
    if (frames.length && timestamp < frames[frames.length - 1]!.timestamp) return null;
    const duplicateTimestamp = frames.length > 0 && timestamp === frames[frames.length - 1]!.timestamp;
    if (duplicateTimestamp) {
      if (JSON.stringify(participants) !== JSON.stringify(frames[frames.length - 1]!.participants)) return null;
    } else {
      frames.push({ timestamp, participants });
      timestampEventCounts = new Map();
    }
    const frameEventCounts = new Map<string, number>();
    if (Array.isArray(frame.events)) for (const event of frame.events) {
      const normalized = timelineEvent(event);
      if (normalized && (!normalized.type.startsWith("ITEM_") && normalized.type !== "SKILL_LEVEL_UP" || normalized.participantId === match.selfParticipantId)) {
        // Repeated frames must not duplicate events. Preserve multiplicity within
        // one frame: buying two identical potions in the same millisecond is valid.
        const key = JSON.stringify(normalized), count = (frameEventCounts.get(key) ?? 0) + 1;
        frameEventCounts.set(key, count);
        if (count > (timestampEventCounts.get(key) ?? 0)) events.push(normalized);
      }
      if (events.length > 8_000) return null;
    }
    for (const [key, count] of frameEventCounts) timestampEventCounts.set(key, Math.max(count, timestampEventCounts.get(key) ?? 0));
  }
  return { frameInterval, frames, events };
}

const matchKeys = ["matchId", "startedAt", "durationSeconds", "queueId", "mapId", "gameVersion", "selfParticipantId", "remake", "participants", "teams", "timeline", "timelineStatus"];
const participantKeys = ["participantId", "teamId", "riotId", "championId", "championName", "position", "win", "kills", "deaths", "assists", "champLevel", "cs", "goldEarned", "damageToChampions", "damageTaken", "visionScore", "wardsPlaced", "wardsKilled", "controlWardsBought", "items", "summonerSpells", "runes", "doubleKills", "tripleKills", "quadraKills", "pentaKills", "killingSprees", "turretKills", "turretPlatesTaken", "inhibitorKills", "objectivesStolen", "damageToObjectives"];
function exact(row: Record<string, unknown> | null, keys: readonly string[]): row is Record<string, unknown> { return !!row && Object.keys(row).length === keys.length && Object.keys(row).every((key) => keys.includes(key)); }
const numericArray = (value: unknown, maxLength: number) => Array.isArray(value) && value.length <= maxLength && value.every((item) => integer(item) !== null);
/** Recheck persisted JSON at the public boundary instead of spreading database content. */
export function parseStoredRiotMatch(value: unknown): RiotMatchDto | null {
  const row = object(value);
  if (!exact(row, matchKeys) || !text(row.matchId, 40) || !RIOT_MATCH_ID_PATTERN.test(String(row.matchId)) || !text(row.startedAt, 30) || !Number.isFinite(Date.parse(String(row.startedAt))) || typeof row.remake !== "boolean" || !text(row.gameVersion, 40)) return null;
  if (!["PENDING", "AVAILABLE", "UNAVAILABLE"].includes(String(row.timelineStatus)) || (row.timelineStatus === "AVAILABLE") !== (row.timeline !== null)) return null;
  if ([row.durationSeconds, row.queueId, row.mapId, row.selfParticipantId].some((item) => integer(item) === null) || !Array.isArray(row.participants) || row.participants.length < 2 || row.participants.length > 16) return null;
  if (!publicQueues.has(Number(row.queueId))) return null;
  const normalizedParticipants = row.participants.map((value) => {
    const p = object(value);
    // Older allowlisted archives predate this optional provider statistic.
    return p && !Object.hasOwn(p, "turretPlatesTaken") ? { ...p, turretPlatesTaken: null } : value;
  });
  for (const value of normalizedParticipants) {
    const p = object(value);
    if (!exact(p, participantKeys) || !text(p.championName, 50) || !(p.riotId === null || text(p.riotId, 22)) || typeof p.win !== "boolean" || ![null, "TOP", "JGL", "MID", "ADC", "SUP"].includes(p.position as string | null)) return null;
    if (!integer(p.participantId, 16) || !integer(p.teamId, 1_000) || !integer(p.championId, 100_000) || [p.kills, p.deaths, p.assists].some((value) => integer(value, 1_000) === null)) return null;
    for (const key of participantKeys.filter((key) => !["riotId", "championName", "position", "win", "items", "summonerSpells", "runes"].includes(key))) if (p[key] !== null && integer(p[key]) === null) return null;
    const runes = object(p.runes);
    if (!numericArray(p.items, 7) || !numericArray(p.summonerSpells, 2) || !exact(runes, ["primaryStyleId", "secondaryStyleId", "perkIds", "statPerks"]) || !numericArray(runes.perkIds, 12) || !numericArray(runes.statPerks, 3) || [runes.primaryStyleId, runes.secondaryStyleId].some((item) => item !== null && integer(item) === null)) return null;
  }
  const participantIds = normalizedParticipants.map((value) => object(value)?.participantId);
  if (new Set(participantIds).size !== participantIds.length || !participantIds.includes(row.selfParticipantId)) return null;
  if (!Array.isArray(row.teams) || row.teams.length > 8) return null;
  for (const value of row.teams) {
    const team = object(value);
    if (!exact(team, ["teamId", "win", "objectives", "bans"]) || integer(team.teamId, 1_000) === null || typeof team.win !== "boolean" || !numericArray(team.bans, 16) || !Array.isArray(team.objectives) || team.objectives.length > 8) return null;
    for (const value of team.objectives) { const item = object(value); if (!exact(item, ["type", "kills", "first"]) || !text(item.type, 30) || integer(item.kills, 10_000) === null || !(item.first === null || typeof item.first === "boolean")) return null; }
  }
  if (row.timeline !== null) {
    const timeline = object(row.timeline);
    if (!exact(timeline, ["frameInterval", "frames", "events"]) || integer(timeline.frameInterval, 300_000) === null || !Array.isArray(timeline.frames) || timeline.frames.length > 241 || !Array.isArray(timeline.events) || timeline.events.length > 8_000) return null;
    let previousTimestamp = -1;
    for (const value of timeline.frames) {
      const frame = object(value);
      if (!exact(frame, ["timestamp", "participants"]) || integer(frame.timestamp, 14_400_000) === null || !Array.isArray(frame.participants) || frame.participants.length > 16) return null;
      if (Number(frame.timestamp) <= previousTimestamp || frame.participants.length !== participantIds.length) return null;
      previousTimestamp = Number(frame.timestamp);
      for (const value of frame.participants) { const p = object(value); if (!exact(p, ["participantId", "totalGold", "cs", "xp", "level", "x", "y"]) || Object.values(p).some((item) => item !== null && integer(item) === null)) return null; }
      const frameIds = frame.participants.map((value) => object(value)?.participantId);
      if (new Set(frameIds).size !== participantIds.length || frameIds.some((id) => !participantIds.includes(id))) return null;
    }
    for (const value of timeline.events) {
      const event = object(value);
      if (!exact(event, ["timestamp", "type", "participantId", "killerId", "victimId", "assistingParticipantIds", "itemId", "beforeId", "afterId", "skillSlot", "monsterType", "monsterSubType", "buildingType", "towerType", "teamId", "laneType", "x", "y"]) || !eventTypes.has(String(event.type)) || !numericArray(event.assistingParticipantIds, 16)) return null;
      if (integer(event.timestamp, 14_400_000) === null || event.skillSlot !== null && !integer(event.skillSlot, 4)) return null;
      for (const [key, item] of Object.entries(event)) {
        if (["type", "assistingParticipantIds"].includes(key)) continue;
        if (["monsterType", "monsterSubType", "buildingType", "towerType", "laneType"].includes(key)) { if (!(item === null || (typeof item === "string" && /^[A-Z0-9_]{1,48}$/u.test(item)))) return null; }
        else if (item !== null && integer(item, 14_400_000) === null) return null;
      }
    }
  }
  // Every field above has passed the whitelist validator; keep the legacy
  // normalization immutable while crossing the unknown JSON boundary once.
  return { ...row, participants: normalizedParticipants } as unknown as RiotMatchDto;
}

export function parseRiotAnalyticsCursor(value: string | null | undefined): Readonly<{ startedAt: Date; matchId: string }> | null {
  if (!value || value.length > 80) return null;
  const [date, matchId, extra] = value.split("|");
  if (extra !== undefined || !date || !matchId || !RIOT_MATCH_ID_PATTERN.test(matchId) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(date)) return null;
  const startedAt = new Date(date);
  return Number.isFinite(startedAt.getTime()) && startedAt.toISOString() === date ? { startedAt, matchId } : null;
}
