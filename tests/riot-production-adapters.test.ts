import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import { RiotGatewayError } from "../src/modules/riot/application/ports";
import { RiotApiGateway } from "../src/modules/riot/infrastructure/riot-api-gateway";
import {
  RiotAesGcmIdentityProtector,
  parseRiotEncryptionKeyring,
} from "../src/modules/riot/infrastructure/riot-identity-protector";
import { RiotRsoAdapter } from "../src/modules/riot/infrastructure/riot-rso-adapter";
import { readRiotProductionConfiguration } from "../src/modules/riot/infrastructure/riot-runtime-policy";
import type { V2Database } from "../src/platform/db/database";
import { riotRsoExchangeResults } from "../src/platform/db/schema/riot";

function keyring(current: "old" | "new" = "old", retainNew = false) {
  return JSON.stringify({
    current,
    keys: {
      old: Buffer.alloc(32, 1).toString("base64url"),
      ...(retainNew ? { new: Buffer.alloc(32, 2).toString("base64url") } : {}),
    },
  });
}

test("PUUID encryption is authenticated, opaque and rotation-ready", async () => {
  const oldProtector = new RiotAesGcmIdentityProtector(parseRiotEncryptionKeyring(keyring()));
  const protectedPuuid = await oldProtector.protect("private-puuid-value");
  assert.equal(protectedPuuid.includes("private-puuid-value"), false);

  const rotated = new RiotAesGcmIdentityProtector(parseRiotEncryptionKeyring(keyring("new", true)));
  assert.equal(await rotated.reveal(protectedPuuid), "private-puuid-value");
  const next = await rotated.protect("next-private-puuid");
  assert.match(next, /^r1\.new\./u);
  const tampered = `${next.slice(0, -1)}${next.endsWith("a") ? "b" : "a"}`;
  await assert.rejects(rotated.reveal(tampered), /INVALID_RIOT_PUUID_CIPHERTEXT/u);
  assert.throws(
    () => parseRiotEncryptionKeyring(JSON.stringify({ current: "missing", keys: { old: randomBytes(32).toString("base64url") } })),
    /INVALID_RIOT_ENCRYPTION_KEYRING/u,
  );
});

test("Riot gateway resolves Riot ID and reads the SOLO queue through bounded official endpoints", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    new Response(JSON.stringify({ puuid: "private-puuid-value", gameName: "A hri", tagLine: "KR1" }), { status: 200 }),
    new Response(JSON.stringify({ id: "encrypted-summoner-id" }), { status: 200 }),
    new Response(JSON.stringify([
      { queueType: "RANKED_FLEX_SR", tier: "GOLD", rank: "I", leaguePoints: 1, wins: 1, losses: 1 },
      { queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 72, wins: 30, losses: 20 },
    ]), { status: 200 }),
  ];
  const requestCredential = ["RGAPI", "safe", "test", "key", "000000000000"].join("-");
  const gateway = new RiotApiGateway({
    apiKey: requestCredential,
    regionalBaseUrl: "https://asia.api.riotgames.com/",
    platformBaseUrl: "https://kr.api.riotgames.com/",
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return responses.shift()!;
    },
  });
  assert.deepEqual(await gateway.resolveRiotId({ gameName: "A hri", tagLine: "KR1" }), {
    gameName: "A hri",
    tagLine: "KR1",
    puuid: "private-puuid-value",
  });
  const rank = await gateway.fetchRank({ puuid: "private-puuid-value" });
  assert.deepEqual(rank, {
    outcome: { kind: "SUCCESS", partial: false },
    snapshot: { tier: "DIAMOND", rank: "II", leaguePoints: 72, wins: 30, losses: 20, partial: false },
  });
  assert.match(calls[0]!.url, /accounts\/by-riot-id\/A%20hri\/KR1$/u);
  assert.match(calls[1]!.url, /summoners\/by-puuid\/private-puuid-value$/u);
  assert.match(calls[2]!.url, /entries\/by-summoner\/encrypted-summoner-id$/u);
  assert.equal(new Headers(calls[0]!.init?.headers).get("x-riot-token"), requestCredential);
});

test("Riot gateway classifies 429, 404, 5xx and malformed responses without exposing credentials", async () => {
  const requestCredential = ["RGAPI", "never", "echo", "this", "credential", "0000"].join("-");
  const responses = [
    new Response("{}", { status: 429, headers: { "Retry-After": "87" } }),
    new Response("{}", { status: 404 }),
    new Response("{}", { status: 503 }),
    new Response("not-json", { status: 200 }),
  ];
  const gateway = new RiotApiGateway({
    apiKey: requestCredential,
    regionalBaseUrl: "https://asia.api.riotgames.com/",
    platformBaseUrl: "https://kr.api.riotgames.com/",
    fetch: async () => responses.shift()!,
  });
  await assert.rejects(
    gateway.resolveRiotId({ gameName: "Ahri", tagLine: "KR1" }),
    (error: unknown) => error instanceof RiotGatewayError && error.code === "RATE_LIMITED" &&
      error.retryAfterSeconds === 87 && !error.message.includes(requestCredential),
  );
  assert.deepEqual(await gateway.fetchRank({ puuid: "private-puuid" }), {
    outcome: { kind: "PERMANENT_FAILURE", code: "NOT_FOUND" },
  });
  assert.deepEqual(await gateway.fetchRank({ puuid: "private-puuid" }), {
    outcome: { kind: "TRANSIENT_FAILURE", code: "UPSTREAM_5XX" },
  });
  assert.deepEqual(await gateway.fetchRank({ puuid: "private-puuid" }), {
    outcome: { kind: "PERMANENT_FAILURE", code: "INVALID_RESPONSE" },
  });
});

test("production runtime configuration is all-or-nothing and binds the exact callback", () => {
  const origin = "https://klol.example";
  const complete = {
    NODE_ENV: "production",
    V2_RIOT_INTEGRATION_ENABLED: "true",
    V2_PUBLIC_DATA_SOURCE: "postgres",
    DATABASE_URL: "postgresql://database.example/klol",
    V2_PUBLIC_ORIGIN: origin,
    RIOT_API_REGIONAL_ROUTE: "asia",
    RIOT_API_PLATFORM_ROUTE: "kr",
    RIOT_API_KEY: "RGAPI-production-placeholder-value",
    RIOT_RSO_CLIENT_ID: "riot-client-id",
    RIOT_RSO_CLIENT_SECRET: "rso-client-secret-placeholder-000000000000",
    RIOT_RSO_REDIRECT_URI: `${origin}/api/me/riot/rso/callback`,
    RIOT_RSO_STATE_SECRET: "state-secret-placeholder-00000000000000",
    RIOT_ENCRYPTION_KEYS: keyring(),
    OPERATIONS_JOB_SECRET: "job-secret-placeholder-0000000000000000",
  };
  const parsed = readRiotProductionConfiguration(complete);
  assert.ok(parsed);
  assert.equal(parsed.rsoRedirectUri, `${origin}/api/me/riot/rso/callback`);
  assert.equal(readRiotProductionConfiguration({ ...complete, RIOT_API_KEY: undefined }), null);
  assert.equal(readRiotProductionConfiguration({ ...complete, V2_RIOT_INTEGRATION_ENABLED: "TRUE" }), null);
  assert.equal(readRiotProductionConfiguration({ ...complete, RIOT_RSO_REDIRECT_URI: "https://evil.example/callback" }), null);
  assert.equal(readRiotProductionConfiguration({ ...complete, V2_RIOT_FAKE_RUNTIME: "true" }), null);
});

test("RSO state is HMAC-bound and authorization URL never includes the client secret", () => {
  const protector = new RiotAesGcmIdentityProtector(parseRiotEncryptionKeyring(keyring()));
  const clientSecret = "rso-client-secret-placeholder-000000000000";
  const adapter = new RiotRsoAdapter({} as V2Database, protector, {
    authorizeUrl: "https://auth.riotgames.com/authorize",
    tokenUrl: "https://auth.riotgames.com/token",
    accountUrl: "https://asia.api.riotgames.com/riot/account/v1/accounts/me",
    clientId: "riot-client-id",
    clientSecret,
    redirectUri: "https://klol.example/api/me/riot/rso/callback",
    stateSecret: "state-secret-placeholder-00000000000000",
  });
  const issued = adapter.issueState(randomUUID());
  assert.equal(adapter.digestState(issued.publicState), issued.digestHex);
  assert.throws(() => adapter.digestState(`${issued.publicState.slice(0, -1)}x`), /INVALID_RIOT_RSO_STATE/u);
  const authorization = adapter.authorizationUrl({ publicState: issued.publicState });
  assert.equal(authorization.includes(clientSecret), false);
  assert.equal(new URL(authorization).origin, "https://auth.riotgames.com");
  assert.equal(new URL(authorization).searchParams.get("redirect_uri"), "https://klol.example/api/me/riot/rso/callback");
});

test("0020 adds only the protected exchange cache and signed sync consumer route", () => {
  const sql = readFileSync(new URL("../drizzle/0020_s12_riot_production_adapters.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE "riot"\."rso_exchange_results"/u);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b/iu);
  assert.doesNotMatch(sql, /(?:access_token|authorization_code|puuid)/iu);
  assert.equal(existsSync(new URL("../src/app/api/internal/jobs/riot-sync/route.ts", import.meta.url)), true);
  const columns = getTableConfig(riotRsoExchangeResults).columns.map((column) => column.name);
  assert.deepEqual(columns, ["state_id", "code_digest", "key_id", "protected_identity", "created_at", "expires_at"]);
});
