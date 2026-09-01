import { timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import type {
  AuthCleanupInput,
  AuthCleanupResult,
  AuthRepository,
  BeginTotpSetupInput,
  CancelPendingTotpSetupInput,
  CancelPendingTotpSetupResult,
  CreateSessionInput,
  DisableTotpInput,
  EnableTotpInput,
  RecordLoginAttemptInput,
  TotpMutationActor,
  TotpSecurityMutationResult,
  TotpSetupResult,
} from "../application/ports/auth-repository";
import type {
  ActiveSessionPrincipal,
  AuthAccountRecord,
  LoginRateLimitRecord,
  TotpCredentialRecord,
} from "../domain/auth-records";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import {
  adminTotpCredentials,
  authSessions,
  loginRateLimitBuckets,
  userAccounts,
} from "@/platform/db/schema/auth";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";
import { fingerprintTotpCredential } from "./totp-envelope";

function normalizedLoginId(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function sha256Digest(value: Uint8Array, label: string): Buffer {
  const digest = Buffer.from(value);
  if (digest.byteLength !== 32) {
    throw new Error(`${label} must be a 32-byte SHA-256 digest.`);
  }
  return digest;
}

function accountRecord(row: typeof userAccounts.$inferSelect): AuthAccountRecord {
  return {
    id: row.id,
    loginId: row.loginId,
    loginIdNormalized: row.loginIdNormalized,
    passwordHash: row.passwordHash,
    role: row.role,
    status: row.status,
    authVersion: row.authVersion,
    deletedAt: row.deletedAt,
  };
}

type LockedTotpActor = Readonly<{
  authVersion: number;
  role: Extract<typeof userAccounts.$inferSelect.role, "ADMIN" | "SUPER_ADMIN">;
}>;

type TotpActorLockResult =
  | Readonly<{ ok: true; account: LockedTotpActor }>
  | Readonly<{ ok: false; reason: "ACCOUNT_NOT_ELIGIBLE" | "SESSION_STALE" }>;

async function lockTotpMutationActor(
  transaction: V2Transaction,
  actor: TotpMutationActor,
  now: Date,
  requireVerifiedTotp: boolean,
): Promise<TotpActorLockResult> {
  const accountRows = await transaction
    .select({
      authVersion: userAccounts.authVersion,
      deletedAt: userAccounts.deletedAt,
      role: userAccounts.role,
      status: userAccounts.status,
    })
    .from(userAccounts)
    .where(eq(userAccounts.id, actor.userAccountId))
    .for("update")
    .limit(1);
  const account = accountRows[0];

  if (
    !account ||
    account.deletedAt !== null ||
    account.status !== "APPROVED" ||
    (account.role !== "ADMIN" && account.role !== "SUPER_ADMIN")
  ) {
    return { ok: false, reason: "ACCOUNT_NOT_ELIGIBLE" };
  }
  if (account.role !== actor.role || account.authVersion !== actor.authVersion) {
    return { ok: false, reason: "SESSION_STALE" };
  }

  const sessionRows = await transaction
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, actor.sessionId),
        eq(authSessions.userAccountId, actor.userAccountId),
        eq(authSessions.authVersion, actor.authVersion),
        eq(authSessions.role, actor.role),
        eq(authSessions.kind, "USER"),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, now),
        requireVerifiedTotp ? isNotNull(authSessions.totpVerifiedAt) : undefined,
      ),
    )
    .for("update")
    .limit(1);
  if (!sessionRows[0]) return { ok: false, reason: "SESSION_STALE" };

  return {
    ok: true,
    account: {
      authVersion: account.authVersion,
      role: account.role as "ADMIN" | "SUPER_ADMIN",
    },
  };
}

function credentialFingerprintMatches(
  credential: TotpCredentialRecord,
  expectedFingerprint: Uint8Array,
): boolean {
  const expected = Buffer.from(expectedFingerprint);
  const actual = fingerprintTotpCredential(credential);
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}

function assertCandidateStep(candidateStep: number): void {
  if (!Number.isSafeInteger(candidateStep) || candidateStep < 0) {
    throw new Error("TOTP step must be a non-negative safe integer.");
  }
}

export class PostgresAuthRepository implements AuthRepository {
  readonly source = "database" as const;

  constructor(private readonly database: V2Database) {}

  async findAccountById(id: string): Promise<AuthAccountRecord | null> {
    const rows = await this.database
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.id, id))
      .limit(1);
    return rows[0] ? accountRecord(rows[0]) : null;
  }

  async findAccountByLoginId(loginId: string): Promise<AuthAccountRecord | null> {
    const rows = await this.database
      .select()
      .from(userAccounts)
      .where(eq(userAccounts.loginIdNormalized, normalizedLoginId(loginId)))
      .limit(1);
    return rows[0] ? accountRecord(rows[0]) : null;
  }

  async createSession(input: CreateSessionInput): Promise<boolean> {
    return withTransaction(this.database, async (transaction) => {
      const accountRows = await transaction
        .select({
          id: userAccounts.id,
          role: userAccounts.role,
          authVersion: userAccounts.authVersion,
        })
        .from(userAccounts)
        .where(
          and(
            eq(userAccounts.id, input.userAccountId),
            isNull(userAccounts.deletedAt),
            eq(userAccounts.status, "APPROVED"),
          ),
        )
        .for("update")
        .limit(1);
      const account = accountRows[0];
      if (
        !account ||
        account.role !== input.role ||
        account.authVersion !== input.authVersion
      ) {
        return false;
      }

      await transaction.insert(authSessions).values({
        id: input.id,
        tokenHash: sha256Digest(input.tokenHash, "Session token hash"),
        userAccountId: input.userAccountId,
        authVersion: input.authVersion,
        role: input.role,
        totpVerifiedAt: input.totpVerifiedAt,
        issuedAt: input.issuedAt,
        expiresAt: input.expiresAt,
      });
      return true;
    });
  }

  async findActiveSession(
    sessionId: string,
    tokenHash: Uint8Array,
    now: Date,
  ): Promise<ActiveSessionPrincipal | null> {
    const rows = await this.database
      .select({
        sessionId: authSessions.id,
        userAccountId: authSessions.userAccountId,
        role: userAccounts.role,
        authVersion: userAccounts.authVersion,
        totpVerifiedAt: authSessions.totpVerifiedAt,
        issuedAt: authSessions.issuedAt,
        expiresAt: authSessions.expiresAt,
      })
      .from(authSessions)
      .innerJoin(userAccounts, eq(userAccounts.id, authSessions.userAccountId))
      .where(
        and(
          eq(authSessions.id, sessionId),
          eq(authSessions.tokenHash, sha256Digest(tokenHash, "Session token hash")),
          eq(authSessions.kind, "USER"),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, now),
          isNull(userAccounts.deletedAt),
          eq(userAccounts.status, "APPROVED"),
          eq(authSessions.authVersion, userAccounts.authVersion),
          eq(authSessions.role, userAccounts.role),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<boolean> {
    const rows = await this.database
      .update(authSessions)
      .set({ revokedAt })
      .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return rows.length === 1;
  }

  async getTotpCredential(userAccountId: string): Promise<TotpCredentialRecord | null> {
    const rows = await this.database
      .select({
        userAccountId: adminTotpCredentials.userAccountId,
        secretCiphertext: adminTotpCredentials.secretCiphertext,
        secretIv: adminTotpCredentials.secretIv,
        secretAuthTag: adminTotpCredentials.secretAuthTag,
        keyVersion: adminTotpCredentials.keyVersion,
        enabledAt: adminTotpCredentials.enabledAt,
        lastUsedStep: adminTotpCredentials.lastUsedStep,
      })
      .from(adminTotpCredentials)
      .where(eq(adminTotpCredentials.userAccountId, userAccountId))
      .limit(1);
    return rows[0] ?? null;
  }

  async consumeTotpStep(userAccountId: string, candidateStep: number, now: Date): Promise<boolean> {
    assertCandidateStep(candidateStep);

    const rows = await this.database
      .update(adminTotpCredentials)
      .set({ lastUsedStep: candidateStep, updatedAt: now })
      .where(
        and(
          eq(adminTotpCredentials.userAccountId, userAccountId),
          isNotNull(adminTotpCredentials.enabledAt),
          or(
            isNull(adminTotpCredentials.lastUsedStep),
            lt(adminTotpCredentials.lastUsedStep, candidateStep),
          ),
        ),
      )
      .returning({ userAccountId: adminTotpCredentials.userAccountId });
    return rows.length === 1;
  }

  async beginOwnTotpSetup(input: BeginTotpSetupInput): Promise<TotpSetupResult> {
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockTotpMutationActor(transaction, input.actor, input.now, false);
      if (!actor.ok) return actor;

      const credentialRows = await transaction
        .select({ enabledAt: adminTotpCredentials.enabledAt })
        .from(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, input.actor.userAccountId))
        .for("update")
        .limit(1);
      const existingCredential = credentialRows[0];
      if (existingCredential?.enabledAt) {
        return { ok: false, reason: "ALREADY_ENABLED" };
      }
      if (existingCredential) {
        return { ok: false, reason: "PENDING_SETUP_EXISTS" };
      }

      const envelope = {
        secretCiphertext: Buffer.from(input.envelope.secretCiphertext),
        secretIv: Buffer.from(input.envelope.secretIv),
        secretAuthTag: Buffer.from(input.envelope.secretAuthTag),
        keyVersion: input.envelope.keyVersion,
        enabledAt: null,
        lastUsedStep: null,
        updatedAt: input.now,
      };
      await transaction.insert(adminTotpCredentials).values({
        userAccountId: input.actor.userAccountId,
        ...envelope,
        createdAt: input.now,
      });

      await transaction.insert(auditEvents).values({
        requestId: input.requestId,
        actorUserAccountId: input.actor.userAccountId,
        action: "ADMIN_TOTP_SETUP_STARTED",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: input.actor.userAccountId,
        beforeJson: { totpStatus: "NOT_CONFIGURED" },
        afterJson: { totpStatus: "SETUP_PENDING" },
        metadataJson: { selfService: true, actorRole: input.actor.role },
        createdAt: input.now,
      });

      return { ok: true };
    });
  }

  async cancelOwnPendingTotpSetup(
    input: CancelPendingTotpSetupInput,
  ): Promise<CancelPendingTotpSetupResult> {
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockTotpMutationActor(transaction, input.actor, input.now, false);
      if (!actor.ok) return actor;

      const credentialRows = await transaction
        .select({ enabledAt: adminTotpCredentials.enabledAt })
        .from(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, input.actor.userAccountId))
        .for("update")
        .limit(1);
      const credential = credentialRows[0];
      if (!credential) return { ok: true, cancelled: false };
      if (credential.enabledAt) return { ok: false, reason: "ALREADY_ENABLED" };

      await transaction
        .delete(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, input.actor.userAccountId));
      await transaction.insert(auditEvents).values({
        requestId: input.requestId,
        actorUserAccountId: input.actor.userAccountId,
        action: "ADMIN_TOTP_SETUP_CANCELLED",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: input.actor.userAccountId,
        beforeJson: { totpStatus: "SETUP_PENDING" },
        afterJson: { totpStatus: "NOT_CONFIGURED" },
        metadataJson: { selfService: true, actorRole: input.actor.role },
        createdAt: input.now,
      });
      return { ok: true, cancelled: true };
    });
  }

  async enableOwnTotp(input: EnableTotpInput): Promise<TotpSecurityMutationResult> {
    assertCandidateStep(input.candidateStep);
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockTotpMutationActor(transaction, input.actor, input.now, false);
      if (!actor.ok) return actor;

      const credentialRows = await transaction
        .select({
          userAccountId: adminTotpCredentials.userAccountId,
          secretCiphertext: adminTotpCredentials.secretCiphertext,
          secretIv: adminTotpCredentials.secretIv,
          secretAuthTag: adminTotpCredentials.secretAuthTag,
          keyVersion: adminTotpCredentials.keyVersion,
          enabledAt: adminTotpCredentials.enabledAt,
          lastUsedStep: adminTotpCredentials.lastUsedStep,
        })
        .from(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, input.actor.userAccountId))
        .for("update")
        .limit(1);
      const credential = credentialRows[0];
      if (!credential) return { ok: false, reason: "SETUP_REQUIRED" };
      if (credential.enabledAt) return { ok: false, reason: "ALREADY_ENABLED" };
      if (!credentialFingerprintMatches(credential, input.expectedCredentialFingerprint)) {
        return { ok: false, reason: "STATE_CHANGED" };
      }

      const consumed = await transaction
        .update(adminTotpCredentials)
        .set({
          enabledAt: input.now,
          lastUsedStep: input.candidateStep,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(adminTotpCredentials.userAccountId, input.actor.userAccountId),
            isNull(adminTotpCredentials.enabledAt),
            or(
              isNull(adminTotpCredentials.lastUsedStep),
              lt(adminTotpCredentials.lastUsedStep, input.candidateStep),
            ),
          ),
        )
        .returning({ userAccountId: adminTotpCredentials.userAccountId });
      if (consumed.length !== 1) return { ok: false, reason: "TOTP_REPLAY" };

      const accountRows = await transaction
        .update(userAccounts)
        .set({
          authVersion: sql`${userAccounts.authVersion} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(userAccounts.id, input.actor.userAccountId),
            eq(userAccounts.authVersion, actor.account.authVersion),
          ),
        )
        .returning({ authVersion: userAccounts.authVersion });
      const nextAuthVersion = accountRows[0]?.authVersion;
      if (nextAuthVersion === undefined) {
        throw new Error("TOTP enable account version update returned no row.");
      }

      const revokedSessions = await transaction
        .update(authSessions)
        .set({ revokedAt: input.now })
        .where(
          and(
            eq(authSessions.userAccountId, input.actor.userAccountId),
            isNull(authSessions.revokedAt),
          ),
        )
        .returning({ id: authSessions.id });

      await transaction.insert(auditEvents).values({
        requestId: input.requestId,
        actorUserAccountId: input.actor.userAccountId,
        action: "ADMIN_TOTP_ENABLED",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: input.actor.userAccountId,
        beforeJson: { totpStatus: "SETUP_PENDING", authVersion: actor.account.authVersion },
        afterJson: { totpStatus: "ENABLED", authVersion: nextAuthVersion },
        metadataJson: {
          selfService: true,
          actorRole: input.actor.role,
          revokedSessionCount: revokedSessions.length,
        },
        createdAt: input.now,
      });

      return {
        ok: true,
        authVersion: nextAuthVersion,
        revokedSessionCount: revokedSessions.length,
      };
    });
  }

  async disableOwnTotp(input: DisableTotpInput): Promise<TotpSecurityMutationResult> {
    assertCandidateStep(input.candidateStep);
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockTotpMutationActor(transaction, input.actor, input.now, true);
      if (!actor.ok) return actor;

      const credentialRows = await transaction
        .select({
          userAccountId: adminTotpCredentials.userAccountId,
          secretCiphertext: adminTotpCredentials.secretCiphertext,
          secretIv: adminTotpCredentials.secretIv,
          secretAuthTag: adminTotpCredentials.secretAuthTag,
          keyVersion: adminTotpCredentials.keyVersion,
          enabledAt: adminTotpCredentials.enabledAt,
          lastUsedStep: adminTotpCredentials.lastUsedStep,
        })
        .from(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, input.actor.userAccountId))
        .for("update")
        .limit(1);
      const credential = credentialRows[0];
      if (!credential?.enabledAt) return { ok: false, reason: "SETUP_REQUIRED" };
      if (!credentialFingerprintMatches(credential, input.expectedCredentialFingerprint)) {
        return { ok: false, reason: "STATE_CHANGED" };
      }

      const consumed = await transaction
        .update(adminTotpCredentials)
        .set({ lastUsedStep: input.candidateStep, updatedAt: input.now })
        .where(
          and(
            eq(adminTotpCredentials.userAccountId, input.actor.userAccountId),
            isNotNull(adminTotpCredentials.enabledAt),
            or(
              isNull(adminTotpCredentials.lastUsedStep),
              lt(adminTotpCredentials.lastUsedStep, input.candidateStep),
            ),
          ),
        )
        .returning({ userAccountId: adminTotpCredentials.userAccountId });
      if (consumed.length !== 1) return { ok: false, reason: "TOTP_REPLAY" };

      await transaction
        .delete(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, input.actor.userAccountId));

      const accountRows = await transaction
        .update(userAccounts)
        .set({
          authVersion: sql`${userAccounts.authVersion} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(userAccounts.id, input.actor.userAccountId),
            eq(userAccounts.authVersion, actor.account.authVersion),
          ),
        )
        .returning({ authVersion: userAccounts.authVersion });
      const nextAuthVersion = accountRows[0]?.authVersion;
      if (nextAuthVersion === undefined) {
        throw new Error("TOTP disable account version update returned no row.");
      }

      const revokedSessions = await transaction
        .update(authSessions)
        .set({ revokedAt: input.now })
        .where(
          and(
            eq(authSessions.userAccountId, input.actor.userAccountId),
            isNull(authSessions.revokedAt),
          ),
        )
        .returning({ id: authSessions.id });

      await transaction.insert(auditEvents).values({
        requestId: input.requestId,
        actorUserAccountId: input.actor.userAccountId,
        action: "ADMIN_TOTP_DISABLED",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: input.actor.userAccountId,
        beforeJson: { totpStatus: "ENABLED", authVersion: actor.account.authVersion },
        afterJson: { totpStatus: "NOT_CONFIGURED", authVersion: nextAuthVersion },
        metadataJson: {
          selfService: true,
          actorRole: input.actor.role,
          revokedSessionCount: revokedSessions.length,
        },
        createdAt: input.now,
      });

      return {
        ok: true,
        authVersion: nextAuthVersion,
        revokedSessionCount: revokedSessions.length,
      };
    });
  }

  async recordLoginAttempt(input: RecordLoginAttemptInput): Promise<LoginRateLimitRecord> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new Error("Login rate limit must be a positive safe integer.");
    }
    if (
      input.windowStartedAt > input.now ||
      input.expiresAt <= input.windowStartedAt ||
      input.blockUntil <= input.now
    ) {
      throw new Error("Login rate-limit timestamps are invalid.");
    }

    const keyHash = sha256Digest(input.keyHash, "Login rate-limit key hash");
    const rows = await this.database
      .insert(loginRateLimitBuckets)
      .values({
        scope: input.scope,
        keyHash,
        windowStartedAt: input.windowStartedAt,
        attemptCount: 1,
        blockedUntil: null,
        expiresAt: input.expiresAt,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          loginRateLimitBuckets.scope,
          loginRateLimitBuckets.keyHash,
          loginRateLimitBuckets.windowStartedAt,
        ],
        set: {
          attemptCount: sql`${loginRateLimitBuckets.attemptCount} + 1`,
          blockedUntil: sql`case
            when ${loginRateLimitBuckets.attemptCount} + 1 > ${input.limit}
            then greatest(
              coalesce(${loginRateLimitBuckets.blockedUntil}, ${input.blockUntil}),
              ${input.blockUntil}
            )
            else ${loginRateLimitBuckets.blockedUntil}
          end`,
          expiresAt: sql`greatest(${loginRateLimitBuckets.expiresAt}, ${input.expiresAt})`,
          updatedAt: input.now,
        },
      })
      .returning({
        scope: loginRateLimitBuckets.scope,
        attemptCount: loginRateLimitBuckets.attemptCount,
        blockedUntil: loginRateLimitBuckets.blockedUntil,
        expiresAt: loginRateLimitBuckets.expiresAt,
      });

    const record = rows[0];
    if (!record) throw new Error("Login rate-limit update returned no row.");
    return record;
  }

  async cleanupExpiredAuthState(input: AuthCleanupInput): Promise<AuthCleanupResult> {
    return withTransaction(this.database, async (transaction) => {
      const expiredSessions = await transaction
        .delete(authSessions)
        .where(
          or(
            lt(authSessions.expiresAt, input.now),
            and(isNotNull(authSessions.revokedAt), lt(authSessions.revokedAt, input.revokedBefore)),
          ),
        )
        .returning({ id: authSessions.id });
      const expiredBuckets = await transaction
        .delete(loginRateLimitBuckets)
        .where(lt(loginRateLimitBuckets.expiresAt, input.now))
        .returning({ scope: loginRateLimitBuckets.scope });

      return {
        sessionsDeleted: expiredSessions.length,
        rateLimitBucketsDeleted: expiredBuckets.length,
      };
    });
  }
}
