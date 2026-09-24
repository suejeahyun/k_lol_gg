import {
  RiotGatewayError,
  type RiotGatewayPort,
  type RiotIdentity,
  type RiotRankSnapshot,
} from "../application/ports";
import { canonicalRiotId } from "../domain/riot-integration";
import { recentSoloSample, summarizeRecentSolo } from "../domain/recent-solo-summary";
import { excludedRiotMatchStartedAt, normalizeRiotMatch, normalizeRiotTimeline, RIOT_MATCH_ID_PATTERN } from "../domain/riot-match-normalizer";
import { riotHistoryStart, type RiotAnalyticsCollection, type RiotMatchDto } from "../domain/riot-player-analytics";

type Fetch = typeof fetch;

type GatewayConfiguration = Readonly<{
  apiKey: string;
  regionalBaseUrl: string;
  platformBaseUrl: string;
  timeoutMilliseconds?: number;
  fetch?: Fetch;
  monotonicNow?: () => number;
}>;

type FetchResult =
  | Readonly<{ kind: "SUCCESS"; value: unknown }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "UNAUTHORIZED" }>
  | Readonly<{ kind: "RATE_LIMITED"; retryAfterSeconds: number }>
  | Readonly<{ kind: "INVALID_RESPONSE" }>
  | Readonly<{ kind: "TRANSIENT"; code: "TIMEOUT" | "NETWORK" | "UPSTREAM_5XX" }>;

const tiers = new Set([
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD",
  "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
]);
const ranks = new Set(["I", "II", "III", "IV"]);

function retryAfterSeconds(value: string | null, now = Date.now()): number {
  if (!value) return 60;
  if (/^\d{1,5}$/u.test(value)) return Math.max(1, Math.min(3_600, Number(value)));
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return 60;
  return Math.max(1, Math.min(3_600, Math.ceil((retryAt - now) / 1_000)));
}

async function readBoundedJson(response: Response, maximumBytes = 64 * 1_024): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("RESPONSE_TOO_LARGE");
  }
  if (!response.body) return JSON.parse(await response.text());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximumBytes) throw new Error("RESPONSE_TOO_LARGE");
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8"));
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}

function boundedInteger(value: unknown, maximum = 10_000_000): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum
    ? Number(value)
    : null;
}

export class RiotApiGateway implements RiotGatewayPort {
  private readonly request: Fetch;
  private readonly timeoutMilliseconds: number;

  constructor(private readonly configuration: GatewayConfiguration) {
    if (!configuration.apiKey || configuration.apiKey.length < 16 || configuration.apiKey.length > 512 || /[\s\u0000-\u001f\u007f]/u.test(configuration.apiKey)) {
      throw new Error("INVALID_RIOT_API_KEY");
    }
    for (const base of [configuration.regionalBaseUrl, configuration.platformBaseUrl]) {
      const parsed = new URL(base);
      if (parsed.pathname !== "/" || parsed.search || parsed.hash || !["https:", "http:"].includes(parsed.protocol)) {
        throw new Error("INVALID_RIOT_API_BASE_URL");
      }
    }
    this.timeoutMilliseconds = configuration.timeoutMilliseconds ?? 5_000;
    if (!Number.isSafeInteger(this.timeoutMilliseconds) || this.timeoutMilliseconds < 1_000 || this.timeoutMilliseconds > 15_000) {
      throw new Error("INVALID_RIOT_API_TIMEOUT");
    }
    this.request = configuration.fetch ?? fetch;
  }

  async resolveRiotId(input: Readonly<{ gameName: string; tagLine: string }>): Promise<RiotIdentity> {
    const riotId = canonicalRiotId(input);
    const result = await this.fetchJson(new URL(
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(riotId.gameName)}/${encodeURIComponent(riotId.tagLine)}`,
      this.configuration.regionalBaseUrl,
    ));
    if (result.kind === "NOT_FOUND") throw new RiotGatewayError("NOT_FOUND");
    if (result.kind === "RATE_LIMITED") throw new RiotGatewayError("RATE_LIMITED", result.retryAfterSeconds);
    if (result.kind === "UNAUTHORIZED") throw new RiotGatewayError("TRANSIENT");
    if (result.kind === "INVALID_RESPONSE") throw new RiotGatewayError("INVALID_RESPONSE");
    if (result.kind === "TRANSIENT") throw new RiotGatewayError("TRANSIENT");
    if (!result.value || typeof result.value !== "object" || Array.isArray(result.value)) {
      throw new RiotGatewayError("INVALID_RESPONSE");
    }
    const body = result.value as Record<string, unknown>;
    const puuid = boundedString(body.puuid, 128);
    const gameName = boundedString(body.gameName, 16);
    const tagLine = boundedString(body.tagLine, 5);
    if (!puuid || !gameName || !tagLine) throw new RiotGatewayError("INVALID_RESPONSE");
    const canonical = canonicalRiotId({ gameName, tagLine });
    return { gameName: canonical.gameName, tagLine: canonical.tagLine, puuid };
  }

  async fetchRank(input: Readonly<{ puuid: string }>): ReturnType<RiotGatewayPort["fetchRank"]> {
    if (!boundedString(input.puuid, 128) || /\s/u.test(input.puuid)) {
      return { outcome: { kind: "PERMANENT_FAILURE", code: "NOT_FOUND" } };
    }
    const league = await this.fetchJson(new URL(
      `/lol/league/v4/entries/by-puuid/${encodeURIComponent(input.puuid)}`,
      this.configuration.platformBaseUrl,
    ));
    const leagueFailure = this.syncFailure(league);
    if (leagueFailure) return leagueFailure;
    if (league.kind !== "SUCCESS" || !Array.isArray(league.value) || league.value.length > 32) {
      return { outcome: { kind: "PERMANENT_FAILURE", code: "INVALID_RESPONSE" } };
    }
    const solo = league.value.find((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry) &&
      (entry as Record<string, unknown>).queueType === "RANKED_SOLO_5x5",
    );
    if (!solo) return { outcome: { kind: "SUCCESS", partial: false }, snapshot: this.unranked() };
    const entry = solo as Record<string, unknown>;
    const tier = boundedString(entry.tier, 16);
    const rank = boundedString(entry.rank, 8);
    const leaguePoints = boundedInteger(entry.leaguePoints);
    const wins = boundedInteger(entry.wins);
    const losses = boundedInteger(entry.losses);
    const snapshot: RiotRankSnapshot = {
      tier: tier && tiers.has(tier) ? tier : null,
      rank: rank && ranks.has(rank) ? rank : null,
      leaguePoints,
      wins,
      losses,
      partial: !(tier && tiers.has(tier) && rank && ranks.has(rank) && leaguePoints !== null && wins !== null && losses !== null),
    };
    return { outcome: { kind: "SUCCESS", partial: snapshot.partial }, snapshot };
  }

  private unranked(): RiotRankSnapshot {
    return { tier: null, rank: null, leaguePoints: null, wins: null, losses: null, partial: false };
  }

  async fetchRecentSolo(input: Readonly<{ puuid: string }>): ReturnType<NonNullable<RiotGatewayPort["fetchRecentSolo"]>> {
    if (!boundedString(input.puuid, 128) || /\s/u.test(input.puuid)) return { kind: "UNAVAILABLE" };
    const clock = this.configuration.monotonicNow ?? (() => performance.now());
    const deadline = clock() + 25_000;
    const read = (url: URL, maximumBytes: number) => {
      const remaining = Math.floor(deadline - clock());
      return remaining > 0 ? this.fetchJson(url, maximumBytes, Math.min(this.timeoutMilliseconds, remaining))
        : Promise.resolve({ kind: "TRANSIENT", code: "TIMEOUT" } as const);
    };
    const idsUrl = new URL(`/lol/match/v5/matches/by-puuid/${encodeURIComponent(input.puuid)}/ids`, this.configuration.regionalBaseUrl);
    idsUrl.searchParams.set("queue", "420");
    idsUrl.searchParams.set("start", "0");
    idsUrl.searchParams.set("count", "20");
    const ids = await read(idsUrl, 8 * 1_024);
    if (ids.kind !== "SUCCESS") return { kind: "UNAVAILABLE", ...(ids.kind === "RATE_LIMITED" ? { retryAfterSeconds: ids.retryAfterSeconds } : {}) };
    if (!Array.isArray(ids.value) || ids.value.length > 20 || ids.value.some((id) => typeof id !== "string" || !/^[A-Z0-9]{2,8}_[0-9]{1,20}$/u.test(id)) || new Set(ids.value).size !== ids.value.length) return { kind: "UNAVAILABLE" };
    const samples: Exclude<ReturnType<typeof recentSoloSample>, "REMAKE" | null>[] = [];
    // Two concurrent reads at most; a failed chunk stops further provider calls.
    for (let index = 0; index < ids.value.length; index += 2) {
      const chunk = ids.value.slice(index, index + 2) as string[];
      const results = await Promise.all(chunk.map((id) => read(new URL(`/lol/match/v5/matches/${encodeURIComponent(id)}`, this.configuration.regionalBaseUrl), 256 * 1_024)));
      const limited = results.filter((result): result is Extract<FetchResult, { kind: "RATE_LIMITED" }> => result.kind === "RATE_LIMITED");
      if (limited.length) return { kind: "UNAVAILABLE", retryAfterSeconds: Math.max(...limited.map((result) => result.retryAfterSeconds)) };
      for (const [offset, result] of results.entries()) {
        if (result.kind !== "SUCCESS") return { kind: "UNAVAILABLE" };
        const sample = recentSoloSample(result.value, chunk[offset]!, input.puuid);
        if (!sample) return { kind: "UNAVAILABLE" };
        if (sample !== "REMAKE") samples.push(sample);
      }
    }
    return { kind: "SUCCESS", summary: summarizeRecentSolo(samples) };
  }

  /** One bounded sync increment. Cache hits never call Match V5 again. */
  async fetchPlayerAnalytics(input: Parameters<NonNullable<RiotGatewayPort["fetchPlayerAnalytics"]>>[0]): Promise<RiotAnalyticsCollection> {
    const clock = this.configuration.monotonicNow ?? (() => performance.now());
    const deadline = clock() + 25_000;
    const cutoff = riotHistoryStart(input.now);
    const cache = new Map(input.cachedMatches.map((match) => [match.matchId, match]));
    const completedStarts = new Map(input.cachedMatches.map((match) => [match.matchId, Date.parse(match.startedAt)]));
    const changed = new Map<string, RiotMatchDto>();
    let historyBefore = input.historyBefore, historyComplete = input.historyComplete, partial = false;
    let retryAfterSeconds: number | undefined;
    const read = async (url: URL, maximumBytes: number): Promise<FetchResult> => {
      const remaining = Math.floor(deadline - clock());
      if (remaining <= 0 || retryAfterSeconds !== undefined) return { kind: "TRANSIENT", code: "TIMEOUT" };
      const result = await this.fetchJson(url, maximumBytes, Math.min(this.timeoutMilliseconds, remaining));
      if (result.kind === "RATE_LIMITED") retryAfterSeconds = Math.max(retryAfterSeconds ?? 0, result.retryAfterSeconds);
      return result;
    };
    const list = async (scope: "solo" | "recent" | "history"): Promise<readonly string[] | null> => {
      const url = new URL(`/lol/match/v5/matches/by-puuid/${encodeURIComponent(input.puuid)}/ids`, this.configuration.regionalBaseUrl);
      url.searchParams.set("start", "0"); url.searchParams.set("count", scope === "history" ? "10" : "20");
      if (scope === "solo") url.searchParams.set("queue", "420");
      else url.searchParams.set("startTime", String(Math.floor(cutoff.getTime() / 1_000)));
      if (scope === "history" && historyBefore !== null) url.searchParams.set("endTime", String(historyBefore));
      const result = await read(url, 8 * 1_024);
      if (result.kind !== "SUCCESS" || !Array.isArray(result.value) || result.value.length > (scope === "history" ? 10 : 20) || result.value.some((id) => typeof id !== "string" || !RIOT_MATCH_ID_PATTERN.test(id)) || new Set(result.value).size !== result.value.length) { partial = true; return null; }
      return result.value as string[];
    };
    if (!boundedString(input.puuid, 128) || /\s/u.test(input.puuid)) return { matches: [], historyBefore, historyComplete, partial: true, recentPageComplete: false };
    const soloIds = await list("solo");
    const recentIds = retryAfterSeconds === undefined ? await list("recent") : null;
    let restartHistory = recentIds?.length === 20 && !recentIds.some((id) => cache.has(id)) &&
      (input.historyBefore !== null || input.historyComplete || input.cachedMatches.length > 0);
    if (restartHistory) {
      // A full page without overlap can hide games between that page and the old
      // archive. Persist a safe high-water cursor even if this run fails halfway;
      // retaining the old cursor would make the new gap invisible on the retry.
      historyBefore = Math.floor(input.now.getTime() / 1_000);
      historyComplete = false;
    }
    const soloSamples = new Map<string, Exclude<ReturnType<typeof recentSoloSample>, null>>();
    const rememberSolo = (match: RiotMatchDto) => {
      if (match.queueId !== 420 || match.mapId !== 11 || match.participants.length !== 10) return;
      if (match.remake) { soloSamples.set(match.matchId, "REMAKE"); return; }
      const self = match.participants.find((row) => row.participantId === match.selfParticipantId);
      if (self && self.damageToChampions !== null && self.visionScore !== null) soloSamples.set(match.matchId, {
        win: self.win, kills: self.kills, deaths: self.deaths, assists: self.assists, damage: self.damageToChampions, vision: self.visionScore, position: self.position,
      });
    };
    for (const match of cache.values()) rememberSolo(match);
    const collect = async (ids: readonly string[]) => {
      const missing = [...new Set(ids)].filter((id) => !completedStarts.has(id));
      for (let index = 0; index < missing.length && retryAfterSeconds === undefined; index += 2) {
        const chunk = missing.slice(index, index + 2);
        const results = await Promise.all(chunk.map((id) => read(new URL(`/lol/match/v5/matches/${encodeURIComponent(id)}`, this.configuration.regionalBaseUrl), 512 * 1_024)));
        for (const [offset, result] of results.entries()) {
          if (result.kind !== "SUCCESS") { partial = true; continue; }
          const id = chunk[offset]!;
          const excludedAt = excludedRiotMatchStartedAt(result.value, id, input.puuid);
          if (excludedAt !== null) {
            completedStarts.set(id, excludedAt);
            if (soloIds?.includes(id)) soloSamples.set(id, "REMAKE");
            continue;
          }
          const match = normalizeRiotMatch(result.value, id, input.puuid);
          if (match) {
            const sample = recentSoloSample(result.value, id, input.puuid);
            if (sample) soloSamples.set(id, sample);
            cache.set(id, match); completedStarts.set(id, Date.parse(match.startedAt)); if (new Date(match.startedAt) >= cutoff) changed.set(id, match);
          }
          else partial = true;
        }
        if (results.some((result) => result.kind !== "SUCCESS") || clock() >= deadline) { partial = true; break; }
      }
    };
    await collect([...(soloIds ?? []), ...(recentIds ?? [])]);
    const recentComplete = recentIds !== null && recentIds.every((id) => completedStarts.has(id));
    if (restartHistory && recentComplete && input.lastCollectedAt && recentIds.every((id) =>
      !cache.has(id) && completedStarts.get(id)! <= input.lastCollectedAt!.getTime())) {
      // Excluded games are deliberately never cached. Only a successfully
      // validated prior latest-page watermark can prove that this all-excluded
      // page is not a new gap; failed/partial runs must not advance that watermark.
      restartHistory = false;
      historyBefore = input.historyBefore;
      historyComplete = input.historyComplete;
    }
    const historyIds = !restartHistory && !historyComplete && historyBefore !== null && retryAfterSeconds === undefined ? await list("history") : null;
    if (historyIds) await collect(historyIds);
    const historyBatchComplete = historyIds !== null && historyIds.every((id) => completedStarts.has(id));
    if (historyBatchComplete && historyIds.length < 10) historyComplete = true;
    if (recentComplete && recentIds.length < 20 && historyBefore === null) historyComplete = true;
    const progressIds = historyBatchComplete ? historyIds : (historyBefore === null || restartHistory) && recentComplete ? recentIds : [];
    if (progressIds.length) {
      const oldest = Math.min(...progressIds.map((id) => completedStarts.get(id)!));
      const nextBefore = Math.floor(oldest / 1_000) - 1;
      historyBefore = historyBefore === null ? nextBefore : Math.min(historyBefore, nextBefore);
      if (historyBefore <= Math.floor(cutoff.getTime() / 1_000)) historyComplete = true;
    }
    // Timelines are larger. Collect up to four pending games per run; completed timelines are immutable.
    const timelines = [...cache.values()].filter((match) => match.timelineStatus === "PENDING" && new Date(match.startedAt) >= cutoff)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 4);
    for (let index = 0; index < timelines.length && clock() < deadline && retryAfterSeconds === undefined; index += 2) {
      const chunk = timelines.slice(index, index + 2);
      const results = await Promise.all(chunk.map((match) => read(new URL(`/lol/match/v5/matches/${encodeURIComponent(match.matchId)}/timeline`, this.configuration.regionalBaseUrl), 2 * 1_024 * 1_024)));
      for (const [offset, result] of results.entries()) {
        const match = chunk[offset]!;
        if (result.kind === "SUCCESS") {
          const timeline = normalizeRiotTimeline(result.value, match);
          if (timeline) { const enriched = { ...match, timeline, timelineStatus: "AVAILABLE" as const }; cache.set(match.matchId, enriched); changed.set(match.matchId, enriched); }
          else {
            // A structurally unsupported successful payload is deterministic;
            // retrying the newest four forever would starve all older timelines.
            changed.set(match.matchId, { ...match, timelineStatus: "UNAVAILABLE" });
            partial = true;
          }
        } else if (result.kind === "NOT_FOUND") changed.set(match.matchId, { ...match, timelineStatus: "UNAVAILABLE" });
        else partial = true;
      }
      if (results.some((result) => !["SUCCESS", "NOT_FOUND"].includes(result.kind))) break;
    }
    const soloComplete = soloIds !== null && soloIds.every((id) => soloSamples.has(id));
    return { matches: [...changed.values()], historyBefore, historyComplete,
      partial: partial || !soloComplete || !recentComplete, recentPageComplete: recentComplete,
      ...(soloComplete ? { recentSolo: summarizeRecentSolo(soloIds.map((id) => soloSamples.get(id)!).filter((sample): sample is Exclude<typeof sample, "REMAKE"> => sample !== "REMAKE")) } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }

  private syncFailure(result: FetchResult): Awaited<ReturnType<RiotGatewayPort["fetchRank"]>> | null {
    if (result.kind === "NOT_FOUND") return { outcome: { kind: "PERMANENT_FAILURE", code: "NOT_FOUND" } };
    if (result.kind === "UNAUTHORIZED") return { outcome: { kind: "PERMANENT_FAILURE", code: "UNAUTHORIZED" } };
    if (result.kind === "RATE_LIMITED") return { outcome: { kind: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds } };
    if (result.kind === "INVALID_RESPONSE") return { outcome: { kind: "PERMANENT_FAILURE", code: "INVALID_RESPONSE" } };
    if (result.kind === "TRANSIENT") return { outcome: { kind: "TRANSIENT_FAILURE", code: result.code } };
    return null;
  }

  private async fetchJson(url: URL, maximumBytes = 64 * 1_024, timeoutMilliseconds = this.timeoutMilliseconds): Promise<FetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    try {
      const response = await this.request(url, {
        method: "GET",
        headers: { Accept: "application/json", "X-Riot-Token": this.configuration.apiKey },
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 404) return { kind: "NOT_FOUND" };
      if (response.status === 401 || response.status === 403) return { kind: "UNAUTHORIZED" };
      if (response.status === 429) {
        return { kind: "RATE_LIMITED", retryAfterSeconds: retryAfterSeconds(response.headers.get("retry-after")) };
      }
      if (response.status >= 500) return { kind: "TRANSIENT", code: "UPSTREAM_5XX" };
      if (!response.ok) return { kind: "INVALID_RESPONSE" };
      try { return { kind: "SUCCESS", value: await readBoundedJson(response, maximumBytes) }; }
      catch { return { kind: "INVALID_RESPONSE" }; }
    } catch {
      return { kind: "TRANSIENT", code: controller.signal.aborted ? "TIMEOUT" : "NETWORK" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
