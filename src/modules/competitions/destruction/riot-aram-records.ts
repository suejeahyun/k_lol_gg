import { AramSyncError, type AramCollection, type AramRecord } from "./aram-rating";

/** Bounded batches make interrupted collections resumable without fabricating missing losses. */
export class RiotAramRecords {
  constructor(private readonly apiKey: string, private readonly regionalBaseUrl: string, private readonly request: typeof fetch = fetch) {}

  private async json(path: string): Promise<unknown> {
    let response: Response;
    try { response = await this.request(new URL(path, this.regionalBaseUrl), { headers: { "X-Riot-Token": this.apiKey }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000) }); }
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
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 1_024_000) { await reader.cancel(); throw new AramSyncError("INVALID_RESPONSE"); } chunks.push(chunk.value); }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw new AramSyncError("INVALID_RESPONSE"); }
    finally { reader.releaseLock(); }
  }

  async next(input: { puuid: string; linkId: string; linkRevision: number; previous?: AramCollection; now: string }): Promise<{ collection: AramCollection; record?: AramRecord }> {
    let collection = input.previous;
    if (collection && (collection.linkId !== input.linkId || collection.linkRevision !== input.linkRevision)) throw new AramSyncError("ACCOUNT_CHANGED");
    if (!collection) {
      const list = await this.json(`/lol/match/v5/matches/by-puuid/${encodeURIComponent(input.puuid)}/ids?queue=450&start=0&count=100`);
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
      if (Number(value.info.gameDuration) < 300 || players[0].gameEndedInEarlySurrender === true) return "EXCLUDED";
      return players[0].win ? "WIN" : "LOSS";
    }));
    const next: AramCollection = { ...collection, processed: collection.processed + batch.length, wins: collection.wins + outcomes.filter((o) => o === "WIN").length, losses: collection.losses + outcomes.filter((o) => o === "LOSS").length, excluded: collection.excluded + outcomes.filter((o) => o === "EXCLUDED").length };
    if (next.processed !== next.matchIds.length) return { collection: next };
    if (next.wins + next.losses === 0) throw new AramSyncError("NO_MATCHES");
    return { collection: next, record: { mode: "ARAM", source: "RIOT", wins: next.wins, losses: next.losses, fetchedAt: input.now, evidence: `Match-V5 queue 450 · 최근 ${next.matchIds.length}판 중 재경기·5분 미만 ${next.excluded}판 제외` } };
  }
}
