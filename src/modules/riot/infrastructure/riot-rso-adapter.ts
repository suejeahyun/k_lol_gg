import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";

import type { RiotIdentity, RiotRsoPort } from "../application/ports";
import { canonicalRiotId } from "../domain/riot-integration";
import type { V2Database } from "@/platform/db/database";
import { riotRsoExchangeResults, riotRsoStates } from "@/platform/db/schema/riot";

import { RiotAesGcmIdentityProtector } from "./riot-identity-protector";

type Fetch = typeof fetch;

type RsoConfiguration = Readonly<{
  authorizeUrl: string;
  tokenUrl: string;
  accountUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  timeoutMilliseconds?: number;
  exchangeCacheTtlMilliseconds?: number;
  fetch?: Fetch;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const statePattern = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/u;

async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("RSO_RESPONSE_INVALID");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) throw new Error("RSO_RESPONSE_INVALID");
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error("RSO_RESPONSE_INVALID"); }
}

function boundedString(value: unknown, minimum: number, maximum: number): string | null {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}

export class RiotRsoAdapter implements RiotRsoPort {
  private readonly request: Fetch;
  private readonly timeoutMilliseconds: number;
  private readonly cacheTtlMilliseconds: number;

  constructor(
    private readonly database: V2Database,
    private readonly protector: RiotAesGcmIdentityProtector,
    private readonly configuration: RsoConfiguration,
  ) {
    for (const endpoint of [configuration.authorizeUrl, configuration.tokenUrl, configuration.accountUrl]) {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
        throw new Error("INVALID_RIOT_RSO_ENDPOINT");
      }
    }
    const redirect = new URL(configuration.redirectUri);
    if (
      !["https:", "http:"].includes(redirect.protocol) || redirect.username || redirect.password ||
      redirect.search || redirect.hash || redirect.pathname !== "/api/me/riot/rso/callback"
    ) throw new Error("INVALID_RIOT_RSO_REDIRECT");
    if (!boundedString(configuration.clientId, 3, 200) || !boundedString(configuration.clientSecret, 32, 1_000)) {
      throw new Error("INVALID_RIOT_RSO_CLIENT");
    }
    if (!boundedString(configuration.stateSecret, 32, 256)) throw new Error("INVALID_RIOT_RSO_STATE_SECRET");
    this.timeoutMilliseconds = configuration.timeoutMilliseconds ?? 5_000;
    this.cacheTtlMilliseconds = configuration.exchangeCacheTtlMilliseconds ?? 10 * 60_000;
    if (
      !Number.isSafeInteger(this.timeoutMilliseconds) || this.timeoutMilliseconds < 1_000 || this.timeoutMilliseconds > 15_000 ||
      !Number.isSafeInteger(this.cacheTtlMilliseconds) || this.cacheTtlMilliseconds < 60_000 || this.cacheTtlMilliseconds > 15 * 60_000
    ) throw new Error("INVALID_RIOT_RSO_TIMEOUT");
    this.request = configuration.fetch ?? fetch;
  }

  issueState(stateId: string): Readonly<{ publicState: string; digestHex: string }> {
    if (!uuidPattern.test(stateId)) throw new Error("INVALID_RIOT_RSO_STATE_ID");
    const signature = createHmac("sha256", this.configuration.stateSecret)
      .update(`klol-v2:riot-rso-state:r1\0${stateId}`)
      .digest("base64url");
    const publicState = `${stateId}.${signature}`;
    return { publicState, digestHex: this.digestState(publicState) };
  }

  digestState(publicState: string): string {
    const match = statePattern.exec(publicState);
    if (!match || !uuidPattern.test(match[1]!)) throw new Error("INVALID_RIOT_RSO_STATE");
    const expected = createHmac("sha256", this.configuration.stateSecret)
      .update(`klol-v2:riot-rso-state:r1\0${match[1]}`)
      .digest();
    const encodedSignature = match[2]!;
    const presented = Buffer.from(encodedSignature, "base64url");
    if (presented.toString("base64url") !== encodedSignature) {
      throw new Error("INVALID_RIOT_RSO_STATE");
    }
    if (presented.byteLength !== expected.byteLength || !timingSafeEqual(presented, expected)) {
      throw new Error("INVALID_RIOT_RSO_STATE");
    }
    return createHash("sha256")
      .update("klol-v2:riot-rso-state-digest:r1\0")
      .update(publicState)
      .digest("hex");
  }

  authorizationUrl(input: Readonly<{ publicState: string }>): string {
    this.digestState(input.publicState);
    const url = new URL(this.configuration.authorizeUrl);
    url.searchParams.set("client_id", this.configuration.clientId);
    url.searchParams.set("redirect_uri", this.configuration.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid offline_access");
    url.searchParams.set("state", input.publicState);
    return url.toString();
  }

  async exchangeOnce(input: Readonly<{ exchangeId: string; authorizationCode: string }>): Promise<RiotIdentity> {
    if (!uuidPattern.test(input.exchangeId) || !boundedString(input.authorizationCode, 8, 2_000)) {
      throw new Error("INVALID_RIOT_RSO_EXCHANGE");
    }
    const codeDigest = createHash("sha256")
      .update("klol-v2:riot-rso-code:r1\0")
      .update(input.authorizationCode)
      .digest();
    const codeDigestHex = codeDigest.toString("hex");
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`riot-rso:${input.exchangeId}`}, 0))`);
      const now = new Date();
      const state = (await transaction.select({
        expiresAt: riotRsoStates.expiresAt,
        consumedAt: riotRsoStates.consumedAt,
      }).from(riotRsoStates).where(eq(riotRsoStates.id, input.exchangeId)).for("update").limit(1))[0];
      if (!state || state.expiresAt <= now) throw new Error("RIOT_RSO_STATE_NOT_AVAILABLE");
      const cached = (await transaction.select().from(riotRsoExchangeResults).where(and(
        eq(riotRsoExchangeResults.stateId, input.exchangeId),
        gt(riotRsoExchangeResults.expiresAt, now),
      )).limit(1))[0];
      if (cached) {
        if (!timingSafeEqual(cached.codeDigest, codeDigest)) throw new Error("RIOT_RSO_EXCHANGE_ID_REUSED");
        return this.protector.revealRsoIdentity({
          stateId: input.exchangeId,
          codeDigestHex,
          protectedIdentity: cached.protectedIdentity,
        });
      }
      if (state.consumedAt) throw new Error("RIOT_RSO_STATE_ALREADY_CONSUMED");

      const identity = await this.exchangeAndReadAccount(input.authorizationCode);
      const protectedResult = this.protector.protectRsoIdentity({
        stateId: input.exchangeId,
        codeDigestHex,
        identity,
      });
      const expiresAt = new Date(Math.min(
        state.expiresAt.getTime(),
        now.getTime() + this.cacheTtlMilliseconds,
      ));
      await transaction.insert(riotRsoExchangeResults).values({
        stateId: input.exchangeId,
        codeDigest,
        keyId: protectedResult.keyId,
        protectedIdentity: protectedResult.protectedIdentity,
        createdAt: now,
        expiresAt,
      });
      return identity;
    }, { isolationLevel: "serializable" });
  }

  private async exchangeAndReadAccount(authorizationCode: string): Promise<RiotIdentity> {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: this.configuration.redirectUri,
    });
    const credentials = Buffer.from(`${this.configuration.clientId}:${this.configuration.clientSecret}`, "utf8").toString("base64");
    const token = await this.fetchJson(this.configuration.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    }, 32 * 1_024);
    if (!token || typeof token !== "object" || Array.isArray(token)) throw new Error("RIOT_RSO_TOKEN_INVALID");
    const accessToken = boundedString((token as Record<string, unknown>).access_token, 16, 8_192);
    if (!accessToken) throw new Error("RIOT_RSO_TOKEN_INVALID");

    const account = await this.fetchJson(this.configuration.accountUrl, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    }, 16 * 1_024);
    if (!account || typeof account !== "object" || Array.isArray(account)) throw new Error("RIOT_RSO_ACCOUNT_INVALID");
    const body = account as Record<string, unknown>;
    const puuid = boundedString(body.puuid, 8, 128);
    const gameName = boundedString(body.gameName, 1, 16);
    const tagLine = boundedString(body.tagLine, 1, 5);
    if (!puuid || !gameName || !tagLine || /\s/u.test(puuid)) throw new Error("RIOT_RSO_ACCOUNT_INVALID");
    const canonical = canonicalRiotId({ gameName, tagLine });
    return { gameName: canonical.gameName, tagLine: canonical.tagLine, puuid };
  }

  private async fetchJson(url: string, init: RequestInit, maximumBytes: number): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await this.request(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new Error("RIOT_RSO_AUTHORIZATION_REJECTED");
      }
      if (response.status === 429) throw new Error("RIOT_RSO_RATE_LIMITED");
      if (!response.ok) throw new Error("RIOT_RSO_UPSTREAM_UNAVAILABLE");
      return await boundedJson(response, maximumBytes);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("RIOT_RSO_")) throw error;
      throw new Error("RIOT_RSO_NETWORK_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}
