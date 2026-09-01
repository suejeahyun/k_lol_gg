import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import type {
  AuthCleanupInput,
  AuthCleanupResult,
  AuthRepository,
  CreateSessionInput,
  RecordLoginAttemptInput,
} from "../application/ports/auth-repository";
import type {
  ActiveSessionPrincipal,
  AuthAccountRecord,
  LoginRateLimitRecord,
  TotpCredentialRecord,
} from "../domain/auth-records";
import type { V2Database } from "@/platform/db/database";
import {
  adminTotpCredentials,
  authSessions,
  loginRateLimitBuckets,
  userAccounts,
} from "@/platform/db/schema/auth";
import { withTransaction } from "@/platform/db/transaction";

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
    if (!Number.isSafeInteger(candidateStep) || candidateStep < 0) {
      throw new Error("TOTP step must be a non-negative safe integer.");
    }

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
