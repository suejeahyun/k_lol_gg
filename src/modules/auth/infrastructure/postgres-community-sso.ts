import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { V2Database } from "@/platform/db/database";
import { userAccounts, communitySsoClients, communitySsoCodes, communitySsoIdentities, communitySites, auditEvents, players, playerAccountClaims, siteSettings } from "@/platform/db/schema";
import { normalizeAccountIdentity, type CommunityProfileInput } from "@/modules/accounts/domain/account-contracts";
import { COMMUNITY_ACCOUNT_PRIVACY_VERSION as ACCOUNT_PRIVACY_VERSION, COMMUNITY_ACCOUNT_TERMS_VERSION as ACCOUNT_TERMS_VERSION } from "@/modules/accounts/domain/account-policies";
import type { TransactionSessionActor } from "../domain/transaction-session";
import { APPROVED_ACCOUNT_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "./transaction-session-guard";
import { communitySsoCallbackMatches, communitySsoSiteAllowsAccount, COMMUNITY_SSO_CODE_LIFETIME_MS, type CommunitySsoRequest, type CommunitySsoPurpose } from "../domain/community-sso";
import { communitySsoChallenge, communitySsoClientHash, communitySsoCodeHash, communitySsoSecretMatches, newCommunitySsoToken } from "./community-sso-crypto";
import type { AuthSessionSeed } from "../domain/auth-session";

export { communitySsoClientHash };

export class CommunitySsoError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "ACCESS_DENIED" | "IDENTITY_UNAVAILABLE") { super(code); }
}

export class PostgresCommunitySso {
  constructor(private readonly database: V2Database) {}

  async usesHubPassword(userAccountId: string): Promise<boolean> {
    const row = (await this.database.select({ id: userAccounts.id }).from(userAccounts)
      .innerJoin(communitySsoIdentities, eq(communitySsoIdentities.userAccountId, userAccounts.id))
      .where(and(eq(userAccounts.id, userAccountId), isNull(userAccounts.passwordHash), isNull(userAccounts.deletedAt))).limit(1))[0];
    return !!row;
  }

  async completeLocalProfile(input: CommunityProfileInput, actor: TransactionSessionActor, now = new Date()) {
    return this.database.transaction(async (transaction) => {
      const account = await lockTransactionSessionActor(transaction, actor, now, {
        ...APPROVED_ACCOUNT_MUTATION_SESSION_POLICY, allowedStatuses: ["PENDING", "APPROVED"],
      });
      if (!account) throw new CommunitySsoError("ACCESS_DENIED");
      const identity = (await transaction.select().from(communitySsoIdentities).where(eq(communitySsoIdentities.userAccountId, account.id)).limit(1))[0];
      if (!identity) throw new CommunitySsoError("ACCESS_DENIED");
      const owned = (await transaction.select().from(players).where(eq(players.userAccountId, account.id)).for("update").limit(1))[0];
      const pending = (await transaction.select().from(playerAccountClaims).where(and(eq(playerAccountClaims.userAccountId, account.id), eq(playerAccountClaims.status, "PENDING"))).limit(1))[0];
      const nicknameNormalized = normalizeAccountIdentity(input.nickname), tagLineNormalized = normalizeAccountIdentity(input.tagLine);
      if (owned) {
        if (owned.nicknameNormalized !== nicknameNormalized || owned.tagLineNormalized !== tagLineNormalized || owned.memberNameNormalized !== normalizeAccountIdentity(input.memberName)) throw new CommunitySsoError("IDENTITY_UNAVAILABLE");
        return { state: "REGISTERED" as const };
      }
      if (pending) {
        if (pending.requestedMemberName !== input.memberName || pending.requestedRiotId !== `${input.nickname}#${input.tagLine}`) throw new CommunitySsoError("IDENTITY_UNAVAILABLE");
        return { state: "CLAIM_PENDING" as const };
      }
      const existing = (await transaction.select().from(players).where(and(eq(players.nicknameNormalized, nicknameNormalized), eq(players.tagLineNormalized, tagLineNormalized))).for("update").limit(1))[0];
      if (existing?.userAccountId) throw new CommunitySsoError("IDENTITY_UNAVAILABLE");
      if (existing) {
        await transaction.insert(playerAccountClaims).values({ id: randomUUID(), userAccountId: account.id, playerId: existing.id,
          requestedMemberName: input.memberName, requestedRiotId: `${input.nickname}#${input.tagLine}`, status: "PENDING", createdAt: now, updatedAt: now });
      } else {
        const approved = account.status === "APPROVED";
        await transaction.insert(players).values({ id: randomUUID(), userAccountId: account.id, memberName: input.memberName,
          memberNameNormalized: normalizeAccountIdentity(input.memberName), nickname: input.nickname, nicknameNormalized,
          tagLine: input.tagLine, tagLineNormalized, status: approved ? "ACTIVE" : "INACTIVE",
          deactivatedAt: approved ? null : now, accountLifecycleDeactivatedAt: approved ? null : now, createdAt: now, updatedAt: now });
      }
      await transaction.update(userAccounts).set({ revision: account.revision + 1, updatedAt: now }).where(eq(userAccounts.id, account.id));
      await transaction.insert(auditEvents).values({ requestId: randomUUID(), actorUserAccountId: account.id,
        action: "COMMUNITY_SSO_PROFILE_SUBMITTED", targetType: "USER_ACCOUNT", targetId: account.id,
        metadataJson: { playerBinding: existing ? "PENDING_MANUAL_CLAIM" : "NEW_PLAYER_CREATED", approvalRequired: account.status === "PENDING", ownershipVerified: false }, createdAt: now });
      return { state: existing ? "CLAIM_PENDING" as const : "REGISTERED" as const };
    });
  }

  async authorizationTarget(request: CommunitySsoRequest, userId: string) {
    const row = (await this.database.select({ site: communitySites, client: communitySsoClients }).from(communitySites)
      .innerJoin(communitySsoClients, eq(communitySsoClients.siteId, communitySites.id))
      .where(eq(communitySites.id, request.siteId)).limit(1))[0];
    if (!row || row.client.revokedAt || !communitySsoSiteAllowsAccount(row.site, userId) || !communitySsoCallbackMatches(row.site.origin, request.callbackUrl)) return null;
    return { siteId: row.site.id, name: row.site.publishedConfigurationJson?.name ?? row.site.configurationJson.name, origin: row.site.origin! };
  }

  async authorize(request: CommunitySsoRequest, actor: TransactionSessionActor, now = new Date()): Promise<string> {
    return this.database.transaction(async (transaction) => {
      const locked = await lockTransactionSessionActor(transaction, actor, now, APPROVED_ACCOUNT_MUTATION_SESSION_POLICY);
      if (!locked) throw new CommunitySsoError("ACCESS_DENIED");
      const site = (await transaction.select().from(communitySites).where(eq(communitySites.id, request.siteId)).for("update").limit(1))[0];
      const client = (await transaction.select().from(communitySsoClients).where(eq(communitySsoClients.siteId, request.siteId)).for("update").limit(1))[0];
      if (!site || !client || client.revokedAt || !communitySsoSiteAllowsAccount(site, actor.userAccountId)
        || !communitySsoCallbackMatches(site.origin, request.callbackUrl)) throw new CommunitySsoError("ACCESS_DENIED");
      const code = newCommunitySsoToken();
      await transaction.insert(communitySsoCodes).values({
        id: randomUUID(), codeHash: communitySsoCodeHash(code), siteId: site.id,
        userAccountId: actor.userAccountId, authVersion: actor.authVersion, purpose: request.purpose,
        callbackUrl: request.callbackUrl, codeChallenge: request.codeChallenge,
        createdAt: now, expiresAt: new Date(now.getTime() + COMMUNITY_SSO_CODE_LIFETIME_MS),
      });
      await transaction.insert(auditEvents).values({ requestId: randomUUID(), actorUserAccountId: actor.userAccountId,
        action: "COMMUNITY_SSO_CONSENT", targetType: "COMMUNITY_SITE", targetId: site.id,
        metadataJson: { purpose: request.purpose, termsVersion: ACCOUNT_TERMS_VERSION, privacyVersion: ACCOUNT_PRIVACY_VERSION }, createdAt: now });
      return code;
    });
  }

  async exchange(input: { siteId: string; code: string; verifier: string; callbackUrl: string; clientSecret: string }, now = new Date()) {
    return this.database.transaction(async (transaction) => {
      const code = (await transaction.select().from(communitySsoCodes).where(and(eq(communitySsoCodes.codeHash, communitySsoCodeHash(input.code)), eq(communitySsoCodes.siteId, input.siteId))).limit(1))[0];
      if (!code || code.consumedAt || code.expiresAt <= now) throw new CommunitySsoError("ACCESS_DENIED");
      const account = (await transaction.select().from(userAccounts).where(eq(userAccounts.id, code.userAccountId)).for("update").limit(1))[0];
      const site = (await transaction.select().from(communitySites).where(eq(communitySites.id, input.siteId)).for("update").limit(1))[0];
      const client = (await transaction.select().from(communitySsoClients).where(eq(communitySsoClients.siteId, input.siteId)).for("update").limit(1))[0];
      if (!account || account.deletedAt || account.status !== "APPROVED" || account.mustChangePassword || account.authVersion !== code.authVersion
        || !site || !client || client.revokedAt || !communitySsoSecretMatches(input.clientSecret, client.secretHash)
        || !communitySsoSiteAllowsAccount(site, account.id) || !communitySsoCallbackMatches(site.origin, input.callbackUrl)
        || code.callbackUrl !== input.callbackUrl || code.codeChallenge !== communitySsoChallenge(input.verifier)) throw new CommunitySsoError("ACCESS_DENIED");
      const consumed = await transaction.update(communitySsoCodes).set({ consumedAt: now })
        .where(and(eq(communitySsoCodes.id, code.id), isNull(communitySsoCodes.consumedAt), gt(communitySsoCodes.expiresAt, now))).returning({ id: communitySsoCodes.id });
      if (consumed.length !== 1) throw new CommunitySsoError("ACCESS_DENIED");
      return { subject: account.id, siteId: site.id, purpose: code.purpose, termsVersion: ACCOUNT_TERMS_VERSION, privacyVersion: ACCOUNT_PRIVACY_VERSION };
    });
  }

  async resolveLocalAccount(input: { issuer: string; subject: string; purpose: CommunitySsoPurpose }, now = new Date()): Promise<{ seed: AuthSessionSeed; needsProfile: boolean }> {
    return this.database.transaction(async (transaction) => {
      // Serialize first login for the same verified subject without merging usernames.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`community-sso:${input.issuer}:${input.subject}`}, 0))`);
      const identity = (await transaction.select().from(communitySsoIdentities).where(and(eq(communitySsoIdentities.hubIssuer, input.issuer), eq(communitySsoIdentities.hubSubject, input.subject))).limit(1))[0];
      let account;
      if (identity) {
        account = (await transaction.select().from(userAccounts).where(eq(userAccounts.id, identity.userAccountId)).for("update").limit(1))[0];
      } else {
        if (input.purpose !== "ACCOUNT") throw new CommunitySsoError("ACCESS_DENIED");
        const settings = (await transaction.select({ features: siteSettings.featuresJson }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1))[0];
        if (settings?.features.registrations !== true) throw new CommunitySsoError("ACCESS_DENIED");
        const accountId = randomUUID();
        account = (await transaction.insert(userAccounts).values({
          id: accountId, loginId: `gg_${accountId}`, loginIdNormalized: `gg_${accountId}`, passwordHash: null,
          role: "USER", status: "PENDING", statusChangedAt: now, statusReasonPublic: "게임 프로필을 등록한 뒤 운영진의 가입 승인을 기다려 주세요.",
          termsAcceptedAt: now, termsVersion: ACCOUNT_TERMS_VERSION, privacyAcceptedAt: now, privacyVersion: ACCOUNT_PRIVACY_VERSION,
          createdAt: now, updatedAt: now,
        }).returning())[0];
        await transaction.insert(communitySsoIdentities).values({ hubIssuer: input.issuer, hubSubject: input.subject, userAccountId: accountId, createdAt: now });
        await transaction.insert(auditEvents).values({ requestId: randomUUID(), actorUserAccountId: accountId,
          action: "COMMUNITY_SSO_ACCOUNT_CREATED", targetType: "USER_ACCOUNT", targetId: accountId,
          afterJson: { role: "USER", status: "PENDING" }, metadataJson: { termsVersion: ACCOUNT_TERMS_VERSION, privacyVersion: ACCOUNT_PRIVACY_VERSION }, createdAt: now });
      }
      if (!account || account.deletedAt || account.status === "SUSPENDED" || account.status === "REJECTED" || account.mustChangePassword) throw new CommunitySsoError("ACCESS_DENIED");
      if (input.purpose === "ADMIN" && (account.status !== "APPROVED" || !["ADMIN", "SUPER_ADMIN"].includes(account.role))) throw new CommunitySsoError("ACCESS_DENIED");
      const player = (await transaction.select({ id: players.id }).from(players).where(eq(players.userAccountId, account.id)).limit(1))[0];
      return { seed: { userId: account.id, role: account.role, purpose: input.purpose, accountStatus: account.status,
        authVersion: account.authVersion, mustChangePassword: false, adminTotpVerified: false, source: "database" }, needsProfile: account.role === "USER" && !player };
    });
  }
}
