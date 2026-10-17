import { readFile, writeFile } from "node:fs/promises";
import type { TeamBalancePlayer } from "../../src/modules/team-tools/domain/team-balance";
import { parseInhouseMajorTier } from "../../src/modules/team-tools/domain/inhouse-fairness";
import { distribution } from "./metrics";

const directory = ".private/balance-research";
const snapshot = JSON.parse(await readFile(`${directory}/snapshot.json`, "utf8"));
const inventory = JSON.parse(await readFile(`${directory}/inventory.json`, "utf8"));
const players = snapshot.players as (TeamBalancePlayer & { source?: string; updatedAt?: string })[];
const now = new Date(inventory.capturedAt).getTime();
const tiers = (key: "currentTier" | "peakTier") => ({
  empty: players.filter(p => !p.rating?.v1?.[key]).length,
  nonemptyUnrecognized: players.filter(p => Boolean(p.rating?.v1?.[key]) && parseInhouseMajorTier(p.rating?.v1?.[key]) === null).length,
  available: players.filter(p => parseInhouseMajorTier(p.rating?.v1?.[key]) !== null).length,
  histogram: Array.from({ length: 10 }, (_, rank) => ({ rank, count: players.filter(p => parseInhouseMajorTier(p.rating?.v1?.[key]) === rank).length })),
});
const roles = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;
const usableIds = new Set(players.filter(p => p.eligiblePositions.length).map(p => p.playerId));
const history = snapshot.history as { participants: { playerId: string; team: string; position: string }[] }[];
const historicalKey = (game: typeof history[number]) => game.participants.map(p => p.playerId).sort().join("|");
const usableGames = history.filter(game => game.participants.every(p => usableIds.has(p.playerId)));
const detailed = { ...inventory, coverageDetails: {
  denominator: players.length,
  usablePool: { players: usableIds.size, currentTierMissing: players.filter(p => usableIds.has(p.playerId) && !p.rating?.v1?.currentTier).length, peakTierMissing: players.filter(p => usableIds.has(p.playerId) && !p.rating?.v1?.peakTier).length, zeroInternalGames: players.filter(p => usableIds.has(p.playerId) && !p.rating?.v1?.internalGames).length, recentSoloConsumed: players.filter(p => usableIds.has(p.playerId) && p.rating?.v1?.recentSolo).length },
  currentTier: tiers("currentTier"), peakTier: tiers("peakTier"),
  positionSources: [...Map.groupBy(players, p => p.source ?? "NONE")].map(([source, values]) => ({ source, count: values.length })),
  preferenceSourceRecordAgeDays: distribution(players.filter(p => p.updatedAt).map(p => (now - new Date(p.updatedAt!).getTime()) / 86400000)),
  roles: roles.map(position => ({ position, mmrSampleSize: distribution(players.map(p => p.rating?.positions?.[position]?.sampleSize ?? 0)), internalSampleSize: distribution(players.map(p => p.rating?.v1?.internalPositionGames[position] ?? 0)) })),
  confidence: distribution(players.map(p => p.rating?.confidence ?? 0)),
  internalGames: distribution(players.map(p => p.rating?.v1?.internalGames ?? 0)),
  historicalCohort: { totalGames: history.length, totalUniqueRosters: new Set(history.map(historicalKey)).size, usableGames: usableGames.length, usableUniqueRosters: new Set(usableGames.map(historicalKey)).size, excludedGames: history.length - usableGames.length, excludedReason: "At least one participant is inactive or has no retained registered position data.", historicalDistinctPlayers: new Set(history.flatMap(game => game.participants.map(p => p.playerId))).size },
  recentSoloGames: distribution(players.filter(p => p.rating?.v1?.recentSolo).map(p => p.rating!.v1!.recentSolo!.games)),
  historicalTenDistinctPlayers: snapshot.history.filter((g: { participants: { playerId: string; team: string; position: string }[] }) => g.participants.length === 10 && new Set(g.participants.map(p => p.playerId)).size === 10).length,
  historicalCompleteRoles: snapshot.history.filter((g: { participants: { team: string; position: string }[] }) => ["BLUE", "RED"].every(team => roles.every(position => g.participants.filter(p => p.team === team && p.position === position).length === 1))).length,
}, limitations: [...inventory.limitations, "Preference source is latest valid application, otherwise latest draft; newer draft preferences do not override an existing application.", "Preference source record age uses application/participant updated_at; a rating refresh can update a draft participant without reconfirming its registered positions, so this is not a position-observation timestamp.", "No linked pregame drafts exist; no current snapshot is used to predict past games."] };
await writeFile(`${directory}/inventory-expanded.json`, JSON.stringify(detailed, null, 2) + "\n");
console.log(JSON.stringify(detailed.coverageDetails, null, 2));
