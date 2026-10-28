import assert from "node:assert/strict";
import test from "node:test";
import { getServiceBrand } from "../src/lib/service-brand";
import { configuredRuntimeDatabaseUrl, requireRuntimeDatabaseUrl } from "../src/platform/db/runtime-database-url";
import { JoseSessionCodec } from "../src/modules/auth/infrastructure/jose-session-codec";
import { parseHubSignupInput, parseSignupInput, parseCommunityProfileInput } from "../src/modules/accounts/domain/account-contracts";

test("managed community identity and database selection fail closed", () => {
  assert.throws(() => getServiceBrand("community", {}), /COMMUNITY_ID/);
  assert.throws(() => getServiceBrand("community", { id: "hub", name: "Unsafe" }), /COMMUNITY_ID/);
  const brand = getServiceBrand("community", { id: "test-club", name: "테스트 커뮤니티", shortName: "테스트" });
  assert.equal(brand.name, "테스트 커뮤니티"); assert.equal(brand.storagePrefix, "gg-community-test-club");
  const env = { NEXT_PUBLIC_SERVICE_ID: "community", NEXT_PUBLIC_COMMUNITY_ID: "test-club", DATABASE_URL: "postgres://localhost/klol", NEXUS_DATABASE_URL: "postgres://localhost/nexus", HUB_DATABASE_URL: "postgres://localhost/hub" };
  assert.equal(configuredRuntimeDatabaseUrl(env), undefined);
  assert.throws(() => requireRuntimeDatabaseUrl(env), /COMMUNITY_DATABASE_URL is not configured/);
  for (const other of [env.DATABASE_URL, env.NEXUS_DATABASE_URL, env.HUB_DATABASE_URL]) assert.throws(() => requireRuntimeDatabaseUrl({ ...env, COMMUNITY_DATABASE_URL: other.replace("localhost", "127.0.0.1:5432") }), /different database/);
  assert.equal(requireRuntimeDatabaseUrl({ ...env, COMMUNITY_DATABASE_URL: "postgres://localhost/community_one" }), "postgres://localhost/community_one");
});

test("managed communities cannot accept each other's sessions, including a shared secret", async () => {
  const secret = "synthetic-only-shared-session-secret-32-bytes";
  const codecs = [new JoseSessionCodec(secret, "community", "alpha"), new JoseSessionCodec(secret, "community", "bravo"), new JoseSessionCodec(secret, "hub"), new JoseSessionCodec(secret, "klol"), new JoseSessionCodec(secret, "nexus")];
  const seed = { userId: "synthetic-local-user", role: "USER" as const, purpose: "ACCOUNT" as const, accountStatus: "APPROVED" as const, mustChangePassword: false, authVersion: 0, adminTotpVerified: false, source: "database" as const };
  for (const [index, codec] of codecs.entries()) {
    const token = await codec.encode(seed);
    for (const [target, verifier] of codecs.entries()) assert.equal(Boolean(await verifier.decode(token)), index === target);
  }
});

test("hub signup requires consent and rejects player, status and privilege injection", () => {
  const input = { loginId: "synthetic-member", password: "Synthetic-password-123", termsAccepted: true, privacyAccepted: true };
  const parsed = parseHubSignupInput(input); assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(Object.keys(parsed.value).sort(), ["kind", "loginId", "loginIdNormalized", "password"]);
  assert.equal(parseSignupInput(input).ok, false);
  for (const extra of [{ role: "SUPER_ADMIN" }, { status: "APPROVED" }, { memberName: "test" }, { riotId: "Test#KR1" }, { termsAccepted: false }, { privacyAccepted: false }, { kind: "HUB" }]) assert.equal(parseHubSignupInput({ ...input, ...extra }).ok, false);
  assert.equal(parseCommunityProfileInput({ memberName: "합성 회원", riotId: "Player#KR1" }).ok, true);
  assert.equal(parseCommunityProfileInput({ memberName: "합성 회원", riotId: "Player#KR1", role: "ADMIN" }).ok, false);
});
