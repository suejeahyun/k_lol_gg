import {
  RiotGatewayError,
  type RiotGatewayPort,
  type RiotIdentity,
  type RiotRankSnapshot,
} from "../application/ports";
import { canonicalRiotId } from "../domain/riot-integration";

type Fetch = typeof fetch;

type GatewayConfiguration = Readonly<{
  apiKey: string;
  regionalBaseUrl: string;
  platformBaseUrl: string;
  timeoutMilliseconds?: number;
  fetch?: Fetch;
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
    const summoner = await this.fetchJson(new URL(
      `/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(input.puuid)}`,
      this.configuration.platformBaseUrl,
    ));
    const summonerFailure = this.syncFailure(summoner);
    if (summonerFailure) return summonerFailure;
    if (summoner.kind !== "SUCCESS" || !summoner.value || typeof summoner.value !== "object" || Array.isArray(summoner.value)) {
      return { outcome: { kind: "PERMANENT_FAILURE", code: "INVALID_RESPONSE" } };
    }
    const summonerId = boundedString((summoner.value as Record<string, unknown>).id, 256);
    if (!summonerId) return { outcome: { kind: "PERMANENT_FAILURE", code: "INVALID_RESPONSE" } };

    const league = await this.fetchJson(new URL(
      `/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`,
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

  private syncFailure(result: FetchResult): Awaited<ReturnType<RiotGatewayPort["fetchRank"]>> | null {
    if (result.kind === "NOT_FOUND") return { outcome: { kind: "PERMANENT_FAILURE", code: "NOT_FOUND" } };
    if (result.kind === "UNAUTHORIZED") return { outcome: { kind: "PERMANENT_FAILURE", code: "UNAUTHORIZED" } };
    if (result.kind === "RATE_LIMITED") return { outcome: { kind: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds } };
    if (result.kind === "INVALID_RESPONSE") return { outcome: { kind: "PERMANENT_FAILURE", code: "INVALID_RESPONSE" } };
    if (result.kind === "TRANSIENT") return { outcome: { kind: "TRANSIENT_FAILURE", code: result.code } };
    return null;
  }

  private async fetchJson(url: URL): Promise<FetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
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
      try { return { kind: "SUCCESS", value: await readBoundedJson(response) }; }
      catch { return { kind: "INVALID_RESPONSE" }; }
    } catch {
      return { kind: "TRANSIENT", code: controller.signal.aborted ? "TIMEOUT" : "NETWORK" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
