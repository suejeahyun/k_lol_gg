import type { RiotMatchDto } from "@/modules/riot/domain/riot-player-analytics";
import { selfParticipant, roundPlayerStat } from "./player-analytics";
import { PLAYER_BUILD_ITEMS } from "./player-item-build-catalog";

export type PlayerBuildKind = "start" | "boots" | "core1" | "core2" | "core3" | "skills";
/** Replay undo events before classifying purchases; final inventory is not a purchase timeline. */
export function playerPurchaseHistory(match: RiotMatchDto) {
  const purchases: { id: number; timestamp: number; undone: boolean }[] = [];
  for (const event of match.timeline?.events ?? []) {
    if (event.participantId !== match.selfParticipantId) continue;
    if (event.type === "ITEM_PURCHASED" && event.itemId && event.itemId > 0) purchases.push({ id: event.itemId, timestamp: event.timestamp, undone: false });
    if (event.type === "ITEM_UNDO" && event.beforeId && event.beforeId > 0) {
      const last = [...purchases].reverse().find((purchase) => purchase.id === event.beforeId && !purchase.undone && purchase.timestamp <= event.timestamp);
      if (last) last.undone = true;
    }
  }
  return purchases.filter((purchase) => !purchase.undone);
}
export function playerTimelineBuilds(matches: readonly RiotMatchDto[], kind: PlayerBuildKind) {
  const groups = new Map<string, { ids: readonly number[]; games: number; wins: number; queueId: number; mapId: number }>();
  const modeSamples = new Map<string, number>();
  let eligibleGames = 0;
  for (const match of matches) {
    const self = selfParticipant(match); if (!self || match.remake || !match.timeline) continue;
    eligibleGames++;
    const mode = `${match.queueId}:${match.mapId}`; modeSamples.set(mode, (modeSamples.get(mode) ?? 0) + 1);
    const purchases = playerPurchaseHistory(match);
    const cores = [...new Set(purchases.filter((purchase) => PLAYER_BUILD_ITEMS[purchase.id]?.completedMaps.includes(match.mapId)).map((purchase) => purchase.id))];
    let ids: number[];
    if (kind === "start") ids = purchases.filter((purchase) => purchase.timestamp <= 90_000 && ![3340, 3341, 3363, 3364].includes(purchase.id)).map((purchase) => purchase.id).sort((a, b) => a - b);
    else if (kind === "boots") { const boots = purchases.filter((purchase) => PLAYER_BUILD_ITEMS[purchase.id]?.boots && PLAYER_BUILD_ITEMS[purchase.id]?.maps.includes(match.mapId)); ids = boots.length ? [boots.at(-1)!.id] : []; }
    else if (kind === "skills") ids = match.timeline.events.filter((event) => event.type === "SKILL_LEVEL_UP" && event.participantId === self.participantId && event.skillSlot).slice(0, 18).map((event) => event.skillSlot!);
    else { const count = kind === "core1" ? 1 : kind === "core2" ? 2 : 3; ids = cores.length >= count ? cores.slice(0, count) : []; }
    if (!ids.length) continue;
    const key = `${mode}:${ids.join("-")}`; const row = groups.get(key) ?? { ids, games: 0, wins: 0, queueId: match.queueId, mapId: match.mapId };
    groups.set(key, { ...row, games: row.games + 1, wins: row.wins + Number(self.win) });
  }
  return { eligibleGames, rows: [...groups.values()].map((row) => { const denominator = modeSamples.get(`${row.queueId}:${row.mapId}`) ?? 0; return { ...row, eligibleGames: denominator, winRate: roundPlayerStat(row.wins / row.games * 100), pickRate: denominator ? roundPlayerStat(row.games / denominator * 100) : 0 }; }).sort((a, b) => b.games - a.games || b.winRate - a.winRate || a.ids.join("-").localeCompare(b.ids.join("-"))) };
}
