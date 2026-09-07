import { createHash } from "node:crypto";

import type {
  RiotGatewayPort,
  RiotIdentity,
  RiotIdentityProtectorPort,
  RiotRankSnapshot,
  RiotRsoPort,
} from "../application/ports";
import { canonicalRiotId, type RiotSyncOutcome } from "../domain/riot-integration";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Test/development adapter only. It performs no network calls. */
export class FakeRiotGateway implements RiotGatewayPort {
  private readonly identities = new Map<string, RiotIdentity>();
  private readonly ranks = new Map<string, Awaited<ReturnType<RiotGatewayPort["fetchRank"]>>>();

  constructor(private readonly allowGeneratedIdentities = false) {}

  registerIdentity(identity: RiotIdentity): void {
    this.identities.set(canonicalRiotId(identity).normalizedKey, { ...identity });
  }

  registerRank(puuid: string, snapshot: RiotRankSnapshot): void {
    this.ranks.set(puuid, { outcome: { kind: "SUCCESS", partial: snapshot.partial }, snapshot: { ...snapshot } });
  }

  registerFailure(puuid: string, outcome: Exclude<RiotSyncOutcome, { kind: "SUCCESS" }>): void {
    this.ranks.set(puuid, { outcome });
  }

  async resolveRiotId(input: Readonly<{ gameName: string; tagLine: string }>): Promise<RiotIdentity> {
    const found = this.identities.get(canonicalRiotId(input).normalizedKey);
    if (!found && this.allowGeneratedIdentities) {
      const riotId = canonicalRiotId(input);
      return { ...riotId, puuid: `fake-puuid-${digest(riotId.normalizedKey).slice(0, 24)}` };
    }
    if (!found) throw new Error("FAKE_RIOT_ID_NOT_FOUND");
    return { ...found };
  }

  async fetchRank(input: Readonly<{ puuid: string }>): ReturnType<RiotGatewayPort["fetchRank"]> {
    const found = this.ranks.get(input.puuid);
    if (!found) return { outcome: { kind: "PERMANENT_FAILURE", code: "NOT_FOUND" } };
    return "snapshot" in found
      ? { outcome: { ...found.outcome }, snapshot: { ...found.snapshot } }
      : { outcome: { ...found.outcome } };
  }
}

/**
 * Deterministic fake for focused tests. A production adapter must use server-held
 * entropy and a durable exchange cache; neither client secrets nor tokens belong in this interface.
 */
export class FakeRsoAdapter implements RiotRsoPort {
  private readonly callbackIdentities = new Map<string, RiotIdentity>();
  private readonly exchanges = new Map<string, Readonly<{ codeDigest: string; identity: RiotIdentity }>>();
  exchangeCalls = 0;

  constructor(
    private readonly namespace = "klol-v2-fake-rso",
    private readonly allowGeneratedCallbacks = false,
  ) {}

  registerCallback(authorizationCode: string, identity: RiotIdentity): void {
    this.callbackIdentities.set(digest(authorizationCode), { ...identity });
  }

  issueState(stateId: string): Readonly<{ publicState: string; digestHex: string }> {
    const publicState = `${stateId}.${digest(`${this.namespace}\0${stateId}`)}`;
    return { publicState, digestHex: this.digestState(publicState) };
  }

  digestState(publicState: string): string {
    return digest(`klol-v2:rso-state:v1\0${publicState}`);
  }

  authorizationUrl(input: Readonly<{ publicState: string }>): string {
    return `https://rso.example.test/authorize?state=${encodeURIComponent(input.publicState)}`;
  }

  async exchangeOnce(input: Readonly<{ exchangeId: string; authorizationCode: string }>): Promise<RiotIdentity> {
    const codeDigest = digest(input.authorizationCode);
    const previous = this.exchanges.get(input.exchangeId);
    if (previous) {
      if (previous.codeDigest !== codeDigest) throw new Error("RSO_EXCHANGE_ID_REUSED");
      return { ...previous.identity };
    }
    const identity = this.callbackIdentities.get(codeDigest) ?? (this.allowGeneratedCallbacks
      ? { gameName: "RsoPlayer", tagLine: "V2", puuid: `fake-rso-puuid-${codeDigest.slice(0, 24)}` }
      : undefined);
    if (!identity) throw new Error("RSO_AUTHORIZATION_CODE_INVALID");
    this.exchangeCalls += 1;
    this.exchanges.set(input.exchangeId, { codeDigest, identity: { ...identity } });
    return { ...identity };
  }
}

/** Reversible fake only; production must replace it with authenticated encryption/KMS. */
export class FakeRiotIdentityProtector implements RiotIdentityProtectorPort {
  async protect(puuid: string): Promise<string> {
    if (!puuid) throw new Error("INVALID_FAKE_PUUID");
    return `fake-protected:${Buffer.from(puuid, "utf8").toString("base64url")}`;
  }

  async reveal(protectedPuuid: string): Promise<string> {
    if (!protectedPuuid.startsWith("fake-protected:")) throw new Error("INVALID_FAKE_PROTECTED_PUUID");
    return Buffer.from(protectedPuuid.slice("fake-protected:".length), "base64url").toString("utf8");
  }
}
