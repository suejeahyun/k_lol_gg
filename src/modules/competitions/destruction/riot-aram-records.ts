import { AramSyncError, type AramCollection, type AramRecord } from "./aram-rating";

/** Bounded batches make interrupted collections resumable without fabricating missing losses. */
export class RiotAramRecords {
  constructor(private readonly apiKey: string, private readonly regionalBaseUrl: string, private readonly request: typeof fetch = fetch) {}

  async json(path: string, base = this.regionalBaseUrl): Promise<unknown> {
    let response: Response;
    try { response = await this.request(new URL(path, base), { headers: { "X-Riot-Token": this.apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000) }); }
    catch { throw new AramSyncError("UNAVAILABLE"); }
    if (response.status === 429) {
      const raw = response.headers.get("retry-after");
      const seconds = raw && /^\d+$/u.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : 60;
      throw new AramSyncError("RATE_LIMITED", Number.isFinite(seconds) ? Math.max(1, Math.min(3600, seconds)) : 60);
    }
    if (!response.ok) throw new AramSyncError(response.status >= 500 || response.status === 401 || response.status === 403 ? "UNAVAILABLE" : "INVALID_RESPONSE");
    if (!response.body) throw new AramSyncError("INVALID_RESPONSE");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 4_096_000) { await reader.cancel(); throw new AramSyncError("INVALID_RESPONSE"); } chunks.push(chunk.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw new AramSyncError("INVALID_RESPONSE"); }
    finally { reader.releaseLock(); }
  }

  async next(input: { puuid: string; linkId: string; linkRevision: number; previous?: AramCollection; now: string; absolute?: boolean }): Promise<{ collection: AramCollection; record?: AramRecord }> {
    let collection = input.previous;
    if (collection && (collection.linkId !== input.linkId || collection.linkRevision !== input.linkRevision)) throw new AramSyncError("ACCOUNT_CHANGED");
    if (!collection) {
      const window = input.absolute ? `&startTime=${Math.floor(Date.parse(input.now) / 1000) - 90 * 86400}&endTime=${Math.floor(Date.parse(input.now) / 1000)}` : "";
      const list = await this.json(`/lol/match/v5/matches/by-puuid/${encodeURIComponent(input.puuid)}/ids?queue=450&start=0&count=100${window}`);
      if (!Array.isArray(list) || list.length > 100 || list.some((id) => typeof id !== "string" || !/^[A-Z0-9]+_\d+$/u.test(id)) || new Set(list).size !== list.length) throw new AramSyncError("INVALID_RESPONSE");
      if (!list.length) throw new AramSyncError("NO_MATCHES");
      collection = { linkId: input.linkId, linkRevision: input.linkRevision, matchIds: list, processed: 0, wins: 0, losses: 0, excluded: 0, startedAt: input.now };
    }
    const batch = collection.matchIds.slice(collection.processed, collection.processed + 5);
    const outcomes = await Promise.all(batch.map(async (id) => {
      const raw = await this.json(`/lol/match/v5/matches/${encodeURIComponent(id)}`);
      const value = raw as { metadata?: { matchId?: unknown }; info?: { queueId?: unknown; gameDuration?: unknown; participants?: { puuid?: unknown; win?: unknown; gameEndedInEarlySurrender?: unknown }[] } } | null;
      if (value?.metadata?.matchId !== id || value.info?.queueId !== 450 || !Number.isSafeInteger(value.info.gameDuration) || !Array.isArray(value.info.participants) || value.info.participants.length !== 10) throw new AramSyncError("INVALID_RESPONSE");
      const players = value.info.participants.filter((p) => p.puuid === input.puuid);
      if (players.length !== 1 || typeof players[0]?.win !== "boolean") throw new AramSyncError("INVALID_RESPONSE");
      if (Number(value.info.gameDuration) < 300 || players[0].gameEndedInEarlySurrender === true) return { outcome: "EXCLUDED", performance: null };
      return { outcome: players[0].win ? "WIN" : "LOSS", performance: aramMatchContribution(raw, input.puuid) };
    }));
    const performances = outcomes.flatMap((o) => o.performance === null ? [] : [o.performance]);
    const next: AramCollection = { ...collection, processed: collection.processed + batch.length, wins: collection.wins + outcomes.filter((o) => o.outcome === "WIN").length, losses: collection.losses + outcomes.filter((o) => o.outcome === "LOSS").length, excluded: collection.excluded + outcomes.filter((o) => o.outcome === "EXCLUDED").length,
      performanceSum: (collection.performanceSum ?? 0) + performances.reduce((a, b) => a + b, 0), performanceGames: (collection.performanceGames ?? 0) + performances.length };
    if (next.processed !== next.matchIds.length) return { collection: next };
    if (next.wins + next.losses === 0) throw new AramSyncError("NO_MATCHES");
    return { collection: next, record: { mode: "ARAM", source: "RIOT", wins: next.wins, losses: next.losses, fetchedAt: input.now,
      ...(next.performanceGames === next.wins + next.losses ? { performanceScore: next.performanceSum! / next.performanceGames! } : {}),
      evidence: `Match-V5 queue 450 · ${input.absolute ? "90일 이내 " : ""}최근 ${next.matchIds.length}판 중 재경기·5분 미만 ${next.excluded}판 제외` } };
  }
}

/** Fixed within-match contribution targets; no entrant percentiles or cross-role raw damage comparisons. */
export function aramMatchContribution(raw: unknown, puuid: string): number | null {
  const value = raw as { info?: { participants?: Record<string, unknown>[] } };
  const rows = value?.info?.participants; if (!Array.isArray(rows) || rows.length !== 10) return null;
  const player = rows.find((p) => p.puuid === puuid); if (!player || ![100, 200].includes(Number(player.teamId))) return null;
  const team = rows.filter((p) => p.teamId === player.teamId); if (team.length !== 5) return null;
  const fields = ["kills", "assists", "totalDamageDealtToChampions", "totalHealsOnTeammates", "totalDamageShieldedOnTeammates", "timeCCingOthers"];
  if (team.some((p) => fields.some((key) => typeof p[key] !== "number" || !Number.isFinite(p[key]) || Number(p[key]) < 0))) return null;
  const sum = (key: string) => team.reduce((total, p) => total + Number(p[key]), 0);
  const share = (keys: string[]) => { const total = keys.reduce((s, key) => s + sum(key), 0); return total ? keys.reduce((s, key) => s + Number(player[key]), 0) / total : 0; };
  const impact = Math.min(1, Math.max(share(["totalDamageDealtToChampions"]) / 0.3, share(["totalHealsOnTeammates", "totalDamageShieldedOnTeammates"]) / 0.5, share(["timeCCingOthers"]) / 0.4));
  const participation = sum("kills") ? Math.min(1, (Number(player.kills) + Number(player.assists)) / sum("kills") / 0.8) : 0;
  return 60 * impact + 40 * participation;
}
