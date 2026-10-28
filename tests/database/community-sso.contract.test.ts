import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { parseHubSignupInput, fingerprintAccountMutation, type AccountMutationCommand, parseSignupInput } from "../../src/modules/accounts/domain/account-contracts";
import { protectAccountReceiptMaterial } from "../../src/modules/accounts/domain/account-receipt-protection";
import { HUB_ACCOUNT_PRIVACY_VERSION, HUB_ACCOUNT_TERMS_VERSION } from "../../src/modules/accounts/domain/account-policies";
import { PostgresAccountRepository } from "../../src/modules/accounts/infrastructure/postgres-account-repository";
import { PostgresCommunitySso } from "../../src/modules/auth/infrastructure/postgres-community-sso";
import { communitySsoChallenge, communitySsoClientHash, newCommunitySsoToken } from "../../src/modules/auth/infrastructure/community-sso-crypto";
import { hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import type { TransactionSessionActor } from "../../src/modules/auth/domain/transaction-session";
import { createDefaultCommunitySiteConfig } from "../../src/modules/community-sites/domain/site-configuration";
import { createDatabaseHandle, type V2Database } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { authSessions, userAccounts, players, communitySites, communitySsoClients, communitySsoCodes, communitySsoIdentities, siteSettings } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function command(scope: string, actor: TransactionSessionActor | null = null): AccountMutationCommand {
  const protectedMaterial = protectAccountReceiptMaterial(Buffer.alloc(32, 7), scope, actor?.userAccountId ?? "synthetic-signup", fingerprintAccountMutation({ action: scope, key: randomUUID() }));
  return { actorUserAccountId: actor?.userAccountId ?? null, actorSession: actor ?? undefined,
    ...protectedMaterial, idempotencyKeyMaterial: randomBytes(32), requestId: randomUUID(), now: new Date() };
}
async function session(database: V2Database, userAccountId: string, role: "USER" | "SUPER_ADMIN", status: "PENDING" | "APPROVED" = "APPROVED", purpose: "ACCOUNT" | "ADMIN" = "ACCOUNT") {
  const account = (await database.select().from(userAccounts).where(eq(userAccounts.id, userAccountId)))[0];
  assert.equal(account.status, status);
  const sessionId = randomUUID(); const now = new Date();
  await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId, role, purpose, authVersion: account.authVersion, issuedAt: now, expiresAt: new Date(now.getTime() + 1800000) });
  return { userAccountId, role, sessionId, authVersion: account.authVersion } satisfies TransactionSessionActor;
}

test("HUB signup and community SSO preserve local authority, replay safety and player approval", async (t) => {
  const connectionString = process.env.TEST_DATABASE_URL!;
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const controller = new Pool({ connectionString, max: 1 });
  const name = `klol_v2_test_sso_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^klol_v2_test_sso_[a-f0-9]{16}$/u);
  await controller.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  const { database, pool } = createDatabaseHandle(url.toString(), { max: 5 });
  try {
    await applyMigrations(database);
    const accounts = new PostgresAccountRepository(database), sso = new PostgresCommunitySso(database);
    const password = "Synthetic-only-password-123";
    const input = parseHubSignupInput({ loginId: "synthetic-hub-member", password, termsAccepted: true, privacyAccepted: true });
    assert.ok(input.ok); if (!input.ok) return;
    const signupCommand = command("account:signup");
    const signedUp = await accounts.signupHubAccount(input.value, await hashPassword(password), signupCommand);
    assert.equal(signedUp.type, "success"); if (signedUp.type !== "success" || !signedUp.response.account) return;
    const ownerId = signedUp.response.account.id;
    await t.test("signup creates an approved USER without a player and replays without promotion", async () => {
      assert.equal(signedUp.response.account?.role, "USER"); assert.equal(signedUp.response.account?.status, "APPROVED"); assert.equal(signedUp.response.account?.player, null);
      const repeated = await accounts.signupHubAccount(input.value, await hashPassword(password), signupCommand);
      assert.equal(repeated.type, "success"); if (repeated.type === "success") { assert.equal(repeated.response.account?.id, ownerId); assert.equal(repeated.replayed, true); }
      const row = (await database.select().from(userAccounts).where(eq(userAccounts.id, ownerId)))[0];
      assert.equal(row.termsVersion, HUB_ACCOUNT_TERMS_VERSION); assert.equal(row.privacyVersion, HUB_ACCOUNT_PRIVACY_VERSION);
      assert.equal((await accounts.authenticateUser({ loginId: input.value.loginId, password }, new Date())).type, "authenticated");
      const reset = await accounts.requestPasswordReset(input.value.loginIdNormalized, randomBytes(32), command("account:reset-request")); assert.equal(reset.type, "success");
    });
    const actor = await session(database, ownerId, "USER");
    const siteId = randomUUID(), secret = newCommunitySsoToken(), verifier = newCommunitySsoToken();
    const config = { ...createDefaultCommunitySiteConfig(), slug: "sso-test-community", name: "합성 SSO 커뮤니티" };
    await database.insert(communitySites).values({ id: siteId, ownerUserAccountId: ownerId, slug: config.slug, configurationJson: config, publishedConfigurationJson: config, origin: "https://sso-child.example", status: "AWAITING_OWNER" });
    await database.insert(communitySsoClients).values({ siteId, secretHash: communitySsoClientHash(secret) });
    const request = { siteId, callbackUrl: "https://sso-child.example/api/auth/community-sso/callback", codeChallenge: communitySsoChallenge(verifier), state: newCommunitySsoToken(), purpose: "ACCOUNT" as const };
    const exchange = (code: string) => ({ siteId, code, verifier, callbackUrl: request.callbackUrl, clientSecret: secret });
    await t.test("authorization binds owner, callback, PKCE and an atomic single-use code", async () => {
      assert.equal(await sso.authorizationTarget(request, randomUUID()), null);
      assert.ok(await sso.authorizationTarget(request, ownerId));
      await assert.rejects(sso.authorize({ ...request, callbackUrl: "https://evil.example/api/auth/community-sso/callback" }, actor));
      const code = await sso.authorize(request, actor);
      await assert.rejects(sso.exchange({ ...exchange(code), verifier: newCommunitySsoToken() }));
      await assert.rejects(sso.exchange({ ...exchange(code), clientSecret: newCommunitySsoToken() }));
      await assert.rejects(sso.exchange({ ...exchange(code), callbackUrl: "https://evil.example/api/auth/community-sso/callback" }));
      const attempts = await Promise.allSettled([sso.exchange(exchange(code)), sso.exchange(exchange(code))]);
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      const result = attempts.find((attempt) => attempt.status === "fulfilled");
      if (result?.status === "fulfilled") { assert.equal(result.value.subject, ownerId); assert.equal("role" in result.value, false); }
      assert.equal((await database.select().from(communitySsoCodes)).some((row) => String(row.codeHash).includes(code)), false);
    });
    await t.test("revocation, account version, status and expiry invalidate issued codes", async () => {
      const versionCode = await sso.authorize(request, actor);
      await database.update(userAccounts).set({ authVersion: 1 }).where(eq(userAccounts.id, ownerId));
      await assert.rejects(sso.exchange(exchange(versionCode)));
      await database.update(userAccounts).set({ authVersion: 0 }).where(eq(userAccounts.id, ownerId));
      const expired = await sso.authorize(request, actor); await assert.rejects(sso.exchange(exchange(expired), new Date(Date.now() + 61000)));
      const revoked = await sso.authorize(request, actor); await database.update(communitySsoClients).set({ revokedAt: new Date() }).where(eq(communitySsoClients.siteId, siteId));
      await assert.rejects(sso.exchange(exchange(revoked))); await database.update(communitySsoClients).set({ revokedAt: null }).where(eq(communitySsoClients.siteId, siteId));
      await database.update(communitySites).set({ status: "FAILED" }).where(eq(communitySites.id, siteId)); await assert.rejects(sso.exchange(exchange(revoked)));
      await database.update(communitySites).set({ status: "ACTIVE" }).where(eq(communitySites.id, siteId));
    });
    const childOwnerId = randomUUID(), hubIssuer = "https://hub.example";
    await database.insert(userAccounts).values({ id: childOwnerId, loginId: "synthetic-child-owner", loginIdNormalized: "synthetic-child-owner", role: "SUPER_ADMIN", status: "APPROVED" });
    await database.insert(communitySsoIdentities).values({ hubIssuer, hubSubject: ownerId, userAccountId: childOwnerId });
    await t.test("central USER may own one child but central privileges never create child admin authority", async () => {
      const owner = await sso.resolveLocalAccount({ issuer: hubIssuer, subject: ownerId, purpose: "ADMIN" });
      assert.equal(owner.seed.userId, childOwnerId); assert.equal(owner.seed.role, "SUPER_ADMIN"); assert.equal(owner.seed.purpose, "ADMIN");
      await assert.rejects(sso.resolveLocalAccount({ issuer: hubIssuer, subject: randomUUID(), purpose: "ADMIN" }));
    });
    await t.test("new SSO member registers an inactive profile that local admin approval activates", async () => {
      const subject = randomUUID();
      const local = await sso.resolveLocalAccount({ issuer: hubIssuer, subject, purpose: "ACCOUNT" });
      assert.equal(local.seed.role, "USER"); assert.equal(local.seed.accountStatus, "PENDING"); assert.equal(local.needsProfile, true);
      assert.equal((await sso.resolveLocalAccount({ issuer: hubIssuer, subject, purpose: "ACCOUNT" })).seed.userId, local.seed.userId);
      await assert.rejects(sso.resolveLocalAccount({ issuer: hubIssuer, subject, purpose: "ADMIN" }));
      const member = await session(database, local.seed.userId, "USER", "PENDING");
      const profile = { memberName: "합성 회원", nickname: "SyntheticNew", tagLine: "SSO" };
      assert.deepEqual(await sso.completeLocalProfile(profile, member), { state: "REGISTERED" });
      assert.deepEqual(await sso.completeLocalProfile(profile, member), { state: "REGISTERED" });
      let player = (await database.select().from(players).where(eq(players.userAccountId, member.userAccountId)))[0];
      assert.equal(player.status, "INACTIVE"); assert.ok(player.accountLifecycleDeactivatedAt);
      const reviewer = await session(database, childOwnerId, "SUPER_ADMIN", "APPROVED", "ADMIN");
      const row = (await database.select().from(userAccounts).where(eq(userAccounts.id, member.userAccountId)))[0];
      const approved = await accounts.changeStatus(member.userAccountId, "APPROVED", { publicReason: "승인 완료", internalReason: "합성 계정 검토 완료", confirmLoginId: row.loginId, expectedClaimId: null, claimOwnershipReviewed: false }, row.revision, command(`account:status-approved:${member.userAccountId}`, reviewer));
      assert.equal(approved.type, "success");
      player = (await database.select().from(players).where(eq(players.userAccountId, member.userAccountId)))[0]; assert.equal(player.status, "ACTIVE");
      const active = await sso.resolveLocalAccount({ issuer: hubIssuer, subject, purpose: "ACCOUNT" }); assert.equal(active.seed.accountStatus, "APPROVED"); assert.equal(active.needsProfile, false);
      await database.update(siteSettings).set({ featuresJson: { registrations: false, matchSubmissions: false, teamBalance: false, kakaoHelp: false, riotIntegration: false, aiAssistant: false } }).where(eq(siteSettings.id, 1));
      await assert.rejects(sso.resolveLocalAccount({ issuer: hubIssuer, subject: randomUUID(), purpose: "ACCOUNT" }));
      assert.equal((await sso.resolveLocalAccount({ issuer: hubIssuer, subject, purpose: "ACCOUNT" })).seed.userId, member.userAccountId);
    });
    await t.test("managed password signup does not bypass the same local approval policy", async () => {
      const parsed = parseSignupInput({ loginId: "synthetic-local-member", password, memberName: "새 합성 회원", riotId: "SyntheticLocal#SSO", termsAccepted: true, privacyAccepted: true }); assert.ok(parsed.ok); if (!parsed.ok) return;
      const result = await accounts.signup(parsed.value, await hashPassword(password), command("account:signup"), true);
      assert.equal(result.type, "success"); if (result.type === "success") { assert.equal(result.response.account?.status, "PENDING"); assert.equal(result.response.account?.player?.status, "INACTIVE"); }
    });
    await t.test("hub account reinstatement never requires an invented game profile", async () => {
      const hubAccounts = new PostgresAccountRepository(database, false);
      const reviewer = await session(database, childOwnerId, "SUPER_ADMIN", "APPROVED", "ADMIN");
      let owner = (await database.select().from(userAccounts).where(eq(userAccounts.id, ownerId)))[0];
      assert.equal((await hubAccounts.changeStatus(ownerId, "SUSPENDED", { publicReason: "합성 검토", internalReason: "합성 테스트", confirmLoginId: owner.loginId }, owner.revision, command(`account:status-suspended:${ownerId}`, reviewer))).type, "success");
      owner = (await database.select().from(userAccounts).where(eq(userAccounts.id, ownerId)))[0];
      assert.equal((await hubAccounts.changeStatus(ownerId, "APPROVED", { publicReason: "합성 복구", internalReason: "합성 테스트", expectedClaimId: null, claimOwnershipReviewed: false, confirmLoginId: owner.loginId }, owner.revision, command(`account:status-approved:${ownerId}`, reviewer))).type, "success");
      assert.equal((await hubAccounts.findSelf(ownerId))?.player, null);
    });
  } finally {
    await pool.end();
    await controller.query(`DROP DATABASE "${name}" WITH (FORCE)`); await controller.end();
  }
});
