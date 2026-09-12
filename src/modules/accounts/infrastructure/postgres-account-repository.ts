import { createHash, randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  hashPassword,
  identifyPasswordHash,
  verifyPasswordHash,
  verifyPasswordHashConstantWork,
} from "@/modules/auth/infrastructure/node-password";
import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
  SELF_PASSWORD_SESSION_POLICY,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { disconnectConnectedRiotIdentityForPlayer } from "@/modules/riot/infrastructure/postgres-riot-identity-change";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import {
  accountMutationReceipts,
  accountStatusHistory,
  adminTotpCredentials,
  authSessions,
  passwordResetRequests,
  userAccounts,
} from "@/platform/db/schema/auth";
import { playerAccountClaims, players } from "@/platform/db/schema/registry";
import { eventCompetitions, eventParticipantIndex } from "@/platform/db/schema/event-competitions";
import { destructionApplicationIndex, destructionCompetitions } from "@/platform/db/schema/destruction-competitions";
import { matchGames, matchParticipants, matchSeries } from "@/platform/db/schema/matches";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type { AccountRepository, UserLoginResult } from "../application/ports/account-repository";
import {
  ACCOUNT_PRIVACY_VERSION,
  ACCOUNT_TERMS_VERSION,
} from "../domain/account-policies";
import {
  normalizeAccountIdentity,
  normalizeLoginId,
  isCanonicalAccountUuid,
  parseLegacyAccountIntegerId,
  accountMutationScope,
  type AccountMutationCommand,
  type AccountMutationOutcome,
  type AccountParticipationDto,
  type AccountStatusInput,
  type AccountSelfDto,
  type AdminAccountDto,
  type AdminAccountListQuery,
  type PasswordChangeInput,
  type OwnPlayerInput,
  type SafeAccountMutationResponse,
  type SignupInput,
  type UserLoginInput,
} from "../domain/account-contracts";

const receiptLifetimeMs = 24 * 60 * 60 * 1_000;
const resetRequestLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

function digest(value: Uint8Array | string): Buffer {
  return createHash("sha256").update(value).digest();
}

function escapeLikePrefix(value: string): string {
  return `${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function errorConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const record = current as { constraint?: unknown; cause?: unknown };
    if (typeof record.constraint === "string") return record.constraint;
    current = record.cause;
  }
  return undefined;
}

type AccountRow = typeof userAccounts.$inferSelect;

async function transactionClock(transaction: V2Transaction): Promise<Date> {
  const result = await transaction.execute(
    sql<{ value: Date }>`select clock_timestamp() as value`,
  );
  const row = result.rows[0];
  if (!row?.value) throw new Error("PostgreSQL transaction clock was unavailable.");
  const value = row.value instanceof Date ? row.value : new Date(String(row.value));
  if (Number.isNaN(value.getTime())) throw new Error("PostgreSQL transaction clock was invalid.");
  return value;
}

async function accountRow(
  database: DatabaseExecutor,
  userAccountId: string,
  options: { lock?: boolean; includeDeleted?: boolean } = {},
): Promise<AccountRow | null> {
  let query = database
    .select()
    .from(userAccounts)
    .where(
      and(
        eq(userAccounts.id, userAccountId),
        options.includeDeleted ? undefined : isNull(userAccounts.deletedAt),
      ),
    )
    .limit(1);
  if (options.lock) query = query.for("update") as typeof query;
  return (await query)[0] ?? null;
}

async function accountDto(
  database: DatabaseExecutor,
  userAccountId: string,
  includeDeleted = false,
): Promise<AdminAccountDto | null> {
  return (await accountDtos(database, [userAccountId], includeDeleted)).get(userAccountId) ?? null;
}

async function accountDtos(
  database: DatabaseExecutor,
  userAccountIds: readonly string[],
  includeDeleted = false,
): Promise<Map<string, AdminAccountDto>> {
  if (userAccountIds.length === 0) return new Map();
  const rows = await database
    .select({
      account: userAccounts,
      linkedPlayer: players,
      totpUserAccountId: adminTotpCredentials.userAccountId,
      totpEnabledAt: adminTotpCredentials.enabledAt,
    })
    .from(userAccounts)
    .leftJoin(players, eq(players.userAccountId, userAccounts.id))
    .leftJoin(adminTotpCredentials, eq(adminTotpCredentials.userAccountId, userAccounts.id))
    .where(and(
      inArray(userAccounts.id, [...userAccountIds]),
      includeDeleted ? undefined : isNull(userAccounts.deletedAt),
    ));
  const claimRows = await database
    .selectDistinctOn([playerAccountClaims.userAccountId], {
      userAccountId: playerAccountClaims.userAccountId,
      claim: playerAccountClaims,
      targetPlayer: players,
    })
    .from(playerAccountClaims)
    .innerJoin(players, eq(players.id, playerAccountClaims.playerId))
    .where(inArray(playerAccountClaims.userAccountId, [...userAccountIds]))
    .orderBy(
      playerAccountClaims.userAccountId,
      desc(playerAccountClaims.updatedAt),
      playerAccountClaims.id,
    );
  const resetRows = await database
    .select({ userAccountId: passwordResetRequests.userAccountId })
    .from(passwordResetRequests)
    .where(and(
      inArray(passwordResetRequests.userAccountId, [...userAccountIds]),
      eq(passwordResetRequests.status, "PENDING"),
      sql<boolean>`${passwordResetRequests.expiresAt} > clock_timestamp()`,
    ));
  const claimsByAccount = new Map(claimRows.map((row) => [row.userAccountId, row]));
  const resetAccounts = new Set(resetRows.map((row) => row.userAccountId));
  const result = new Map<string, AdminAccountDto>();
  for (const row of rows) {
    const account = row.account;
    const linkedPlayer = row.linkedPlayer;
    const claimRow = claimsByAccount.get(account.id);
    const claim = claimRow?.claim;
    const targetPlayer = claimRow?.targetPlayer;
    result.set(account.id, {
    id: account.id,
    legacyId: account.legacyId,
    loginId: account.loginId,
    role: account.role,
    status: account.status,
    revision: account.revision,
    mustChangePassword: account.mustChangePassword,
    statusChangedAt: account.statusChangedAt?.toISOString() ?? null,
    statusReason: account.statusReasonPublic,
    passwordChangedAt: account.passwordChangedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    deletedAt: account.deletedAt?.toISOString() ?? null,
    resetRequestPending: resetAccounts.has(account.id),
    passwordConfigured: identifyPasswordHash(account.passwordHash) !== "UNKNOWN",
    adminTotpConfigured: row.totpUserAccountId !== null,
    adminTotpEnabledAt: row.totpEnabledAt?.toISOString() ?? null,
    adminTotpSetupPending: row.totpUserAccountId !== null && row.totpEnabledAt === null,
    player:
      linkedPlayer
        ? {
            id: linkedPlayer.id,
            memberName: linkedPlayer.memberName,
            nickname: linkedPlayer.nickname,
            tagLine: linkedPlayer.tagLine,
            riotId: `${linkedPlayer.nickname}#${linkedPlayer.tagLine}`,
            peakTier: linkedPlayer.peakTier,
            currentTier: linkedPlayer.currentTier,
            status: linkedPlayer.status,
            revision: linkedPlayer.revision,
          }
        : null,
    playerClaim: claim
      && targetPlayer ? {
          id: claim.id,
          status: claim.status,
          requestedRiotId: claim.requestedRiotId,
          ownershipVerified: false,
        }
      : null,
    playerClaimReview: claim
      ? {
          id: claim.id,
          status: claim.status,
          createdAt: claim.createdAt.toISOString(),
          requestedMemberName: claim.requestedMemberName,
          requestedRiotId: claim.requestedRiotId,
          ownershipVerified: false,
          targetPlayer: {
            id: targetPlayer!.id,
            memberName: targetPlayer!.memberName,
            riotId: `${targetPlayer!.nickname}#${targetPlayer!.tagLine}`,
            status: targetPlayer!.status,
            userAccountId: targetPlayer!.userAccountId,
          },
        }
      : null,
    });
  }
  return result;
}

function selfDto(dto: AdminAccountDto): AccountSelfDto {
  const {
    deletedAt: _deletedAt,
    resetRequestPending: _resetRequestPending,
    updatedAt: _updatedAt,
    playerClaimReview: _playerClaimReview,
    passwordConfigured: _passwordConfigured,
    adminTotpConfigured: _adminTotpConfigured,
    adminTotpEnabledAt: _adminTotpEnabledAt,
    adminTotpSetupPending: _adminTotpSetupPending,
    player,
    ...safe
  } = dto;
  void _deletedAt;
  void _resetRequestPending;
  void _updatedAt;
  void _playerClaimReview;
  void _passwordConfigured;
  void _adminTotpConfigured;
  void _adminTotpEnabledAt;
  void _adminTotpSetupPending;
  return {
    ...safe,
    player: player
      ? {
          id: player.id,
          nickname: player.nickname,
          tagLine: player.tagLine,
          riotId: player.riotId,
          peakTier: player.peakTier,
          currentTier: player.currentTier,
          status: player.status,
          revision: player.revision,
        }
      : null,
  };
}

function auditAccountSnapshot(account: AccountRow) {
  return {
    id: account.id,
    legacyId: account.legacyId,
    loginId: account.loginId,
    role: account.role,
    status: account.status,
    revision: account.revision,
    authVersion: account.authVersion,
    mustChangePassword: account.mustChangePassword,
    deleted: account.deletedAt !== null,
  };
}

type ReceiptIdentity = Readonly<{
  principalKeyHash: Buffer;
  keyHash: Buffer;
  requestHash: Buffer;
  scope: string;
}>;

function receiptIdentity(command: AccountMutationCommand, scope: string): ReceiptIdentity {
  return {
    principalKeyHash: digest(command.principalKeyMaterial),
    keyHash: digest(command.idempotencyKeyMaterial),
    requestHash: digest(command.requestFingerprint),
    scope,
  };
}

async function startMutation(
  transaction: V2Transaction,
  command: AccountMutationCommand,
  scope: string,
): Promise<Readonly<{ identity: ReceiptIdentity; replay: AccountMutationOutcome | null }>> {
  const identity = receiptIdentity(command, scope);
  const lockMaterial = digest(Buffer.concat([identity.principalKeyHash, identity.keyHash])).toString("hex");
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockMaterial}, 0))`,
  );

  const conditions = and(
    eq(accountMutationReceipts.principalKeyHash, identity.principalKeyHash),
    eq(accountMutationReceipts.scope, identity.scope),
    eq(accountMutationReceipts.keyHash, identity.keyHash),
  );
  const receipt = (
    await transaction
      .select()
      .from(accountMutationReceipts)
      .where(
        and(
          conditions,
          sql<boolean>`${accountMutationReceipts.expiresAt} > clock_timestamp()`,
        ),
      )
      .limit(1)
  )[0];
  if (!receipt) {
    await transaction
      .delete(accountMutationReceipts)
      .where(
        and(
          conditions,
          sql<boolean>`${accountMutationReceipts.expiresAt} <= clock_timestamp()`,
        ),
      );
    return { identity, replay: null };
  }
  if (!Buffer.from(receipt.requestHash).equals(identity.requestHash)) {
    return { identity, replay: { type: "conflict", reason: "IDEMPOTENCY_KEY_REUSED" } };
  }
  if (receipt.oneTimeSecretIssued) {
    return { identity, replay: { type: "conflict", reason: "ONE_TIME_SECRET_ALREADY_ISSUED" } };
  }

  const response = receipt.responseJson as SafeAccountMutationResponse;
  return {
    identity,
    replay: {
      type: "success",
      status: receipt.responseStatus as 200 | 201 | 202,
      response,
      revision: response.playerRevision ?? response.account?.revision,
      replayed: true,
    },
  };
}

async function saveReceipt(
  transaction: V2Transaction,
  command: AccountMutationCommand,
  identity: ReceiptIdentity,
  outcome: Extract<AccountMutationOutcome, { type: "success" }>,
  actorUserAccountId = command.actorUserAccountId,
) {
  // The persisted response is deliberately independent from oneTimeSecret.
  // Temporary passwords are never written to receipts, audit rows, or logs.
  await transaction.insert(accountMutationReceipts).values({
    actorUserAccountId,
    principalKeyHash: identity.principalKeyHash,
    scope: identity.scope,
    keyHash: identity.keyHash,
    requestHash: identity.requestHash,
    responseStatus: outcome.status,
    responseJson: outcome.response,
    responseEtag: outcome.revision === undefined ? null : `"${outcome.revision}"`,
    oneTimeSecretIssued: outcome.oneTimeSecret !== undefined,
    createdAt: sql`clock_timestamp()`,
    expiresAt: sql`clock_timestamp() + (${receiptLifetimeMs} * interval '1 millisecond')`,
  });
}

type LockedAdminActor = Readonly<{
  id: string;
  role: "ADMIN" | "SUPER_ADMIN";
  authVersion: number;
}>;

async function lockAdminActor(
  transaction: V2Transaction,
  command: AccountMutationCommand,
): Promise<LockedAdminActor | null> {
  if (!command.actorSession || command.actorUserAccountId !== command.actorSession.userAccountId) {
    return null;
  }
  const actor = await lockTransactionSessionActor(
    transaction,
    command.actorSession,
    command.now,
    ADMIN_MUTATION_SESSION_POLICY,
  );
  return actor && (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN")
    ? { id: actor.id, role: actor.role, authVersion: actor.authVersion }
    : null;
}

async function lockSelfActor(
  transaction: V2Transaction,
  command: AccountMutationCommand,
): Promise<AccountRow | null> {
  if (!command.actorSession || command.actorUserAccountId !== command.actorSession.userAccountId) {
    return null;
  }
  const guarded = await lockTransactionSessionActor(
    transaction,
    command.actorSession,
    command.now,
    SELF_PASSWORD_SESSION_POLICY,
  );
  return guarded
    ? accountRow(transaction, guarded.id, { lock: true })
    : null;
}

function adminViewerDto(
  dto: AdminAccountDto,
  viewerRole: "ADMIN" | "SUPER_ADMIN",
): AdminAccountDto {
  return viewerRole === "SUPER_ADMIN"
    ? dto
    : {
        ...dto,
        adminTotpConfigured: false,
        adminTotpEnabledAt: null,
        adminTotpSetupPending: false,
      };
}

async function lockAdminActorAndTarget(
  transaction: V2Transaction,
  command: AccountMutationCommand,
  targetUserAccountId: string,
): Promise<Readonly<{ actor: LockedAdminActor | null; target: AccountRow | null }>> {
  if (!command.actorSession || command.actorUserAccountId !== command.actorSession.userAccountId) {
    return { actor: null, target: null };
  }
  const ids = [...new Set([command.actorSession.userAccountId, targetUserAccountId])].sort();
  const lockedRows = await transaction
    .select()
    .from(userAccounts)
    .where(inArray(userAccounts.id, ids))
    .orderBy(asc(userAccounts.id))
    .for("update");
  const actor = await lockAdminActor(transaction, command);
  return {
    actor,
    target: lockedRows.find((row) => row.id === targetUserAccountId) ?? null,
  };
}

function loginConfirmationMatches(account: AccountRow, confirmation: string | undefined): boolean {
  return typeof confirmation === "string" &&
    account.loginId.normalize("NFKC") === confirmation.normalize("NFKC");
}

async function revokeAllSessions(
  transaction: V2Transaction,
  userAccountId: string,
  now: Date,
) {
  return transaction
    .update(authSessions)
    .set({ revokedAt: now })
    .where(and(eq(authSessions.userAccountId, userAccountId), isNull(authSessions.revokedAt)))
    .returning({ id: authSessions.id });
}

function adminMayMutateTarget(actor: LockedAdminActor, target: AccountRow): boolean {
  if (target.role === "SUPER_ADMIN" || target.id === actor.id) return false;
  return actor.role === "SUPER_ADMIN" || target.role === "USER";
}

type ClaimReopenResult =
  | Readonly<{ ok: true; reopened: boolean }>
  | Readonly<{ ok: false; reason: "PLAYER_CLAIM_TAKEN" }>;

async function reopenLatestRejectedClaim(
  transaction: V2Transaction,
  input: {
    actorId: string;
    userAccountId: string;
    requestId: string;
    now: Date;
  },
): Promise<ClaimReopenResult> {
  const linkedPlayer = (
    await transaction
      .select({ id: players.id })
      .from(players)
      .where(eq(players.userAccountId, input.userAccountId))
      .for("update")
      .limit(1)
  )[0];
  if (linkedPlayer) return { ok: true, reopened: false };

  const pendingClaim = (
    await transaction
      .select({ id: playerAccountClaims.id })
      .from(playerAccountClaims)
      .where(
        and(
          eq(playerAccountClaims.userAccountId, input.userAccountId),
          eq(playerAccountClaims.status, "PENDING"),
        ),
      )
      .for("update")
      .limit(1)
  )[0];
  if (pendingClaim) return { ok: true, reopened: false };

  const rejectedClaimCandidate = (
    await transaction
      .select()
      .from(playerAccountClaims)
      .where(
        and(
          eq(playerAccountClaims.userAccountId, input.userAccountId),
          eq(playerAccountClaims.status, "REJECTED"),
        ),
      )
      .orderBy(desc(playerAccountClaims.updatedAt))
      .limit(1)
  )[0];
  if (!rejectedClaimCandidate) return { ok: true, reopened: false };

  const targetPlayer = (
    await transaction
      .select({ id: players.id, userAccountId: players.userAccountId })
      .from(players)
      .where(eq(players.id, rejectedClaimCandidate.playerId))
      .for("update")
      .limit(1)
  )[0];
  if (!targetPlayer || targetPlayer.userAccountId !== null) {
    return { ok: false, reason: "PLAYER_CLAIM_TAKEN" };
  }
  const rejectedClaim = (
    await transaction
      .select()
      .from(playerAccountClaims)
      .where(
        and(
          eq(playerAccountClaims.id, rejectedClaimCandidate.id),
          eq(playerAccountClaims.userAccountId, input.userAccountId),
          eq(playerAccountClaims.playerId, targetPlayer.id),
          eq(playerAccountClaims.status, "REJECTED"),
        ),
      )
      .for("update")
      .limit(1)
  )[0];
  if (!rejectedClaim) return { ok: false, reason: "PLAYER_CLAIM_TAKEN" };
  const competing = (
    await transaction
      .select({ id: playerAccountClaims.id })
      .from(playerAccountClaims)
      .where(
        and(
          eq(playerAccountClaims.playerId, rejectedClaim.playerId),
          eq(playerAccountClaims.status, "PENDING"),
          ne(playerAccountClaims.id, rejectedClaim.id),
        ),
      )
      .for("update")
      .limit(1)
  )[0];
  if (competing) return { ok: false, reason: "PLAYER_CLAIM_TAKEN" };

  const reopened = await transaction
    .update(playerAccountClaims)
    .set({
      status: "PENDING",
      reviewedByUserAccountId: null,
      reviewedAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(playerAccountClaims.id, rejectedClaim.id),
        eq(playerAccountClaims.status, "REJECTED"),
      ),
    )
    .returning({ id: playerAccountClaims.id });
  if (reopened.length !== 1) throw new Error("Rejected player claim could not be reopened.");

  await transaction.insert(auditEvents).values({
    requestId: input.requestId,
    actorUserAccountId: input.actorId,
    action: "PLAYER_ACCOUNT_CLAIM_REOPENED",
    targetType: "PLAYER_ACCOUNT_CLAIM",
    targetId: rejectedClaim.id,
    beforeJson: { status: "REJECTED", playerId: rejectedClaim.playerId },
    afterJson: { status: "PENDING", playerId: rejectedClaim.playerId },
    metadataJson: {
      ownershipVerified: false,
      playerStillUnlinked: true,
      priorTransitionAction: "PLAYER_ACCOUNT_CLAIM_REJECTED",
      priorReviewedByUserAccountId: rejectedClaim.reviewedByUserAccountId,
      priorReviewedAt: rejectedClaim.reviewedAt?.toISOString() ?? null,
    },
    createdAt: input.now,
  });
  return { ok: true, reopened: true };
}

async function setLinkedPlayerAccountLifecycle(
  transaction: V2Transaction,
  input: {
    actorId: string;
    userAccountId: string;
    requestId: string;
    now: Date;
    active: boolean;
    reason: "ACCOUNT_REJECTED" | "ACCOUNT_PENDING" | "ACCOUNT_SOFT_DELETED" | "ACCOUNT_REOPENED" | "ACCOUNT_APPROVED";
  },
) {
  const player = (
    await transaction
      .select()
      .from(players)
      .where(eq(players.userAccountId, input.userAccountId))
      .for("update")
      .limit(1)
  )[0];
  if (!player) return { changed: false, status: null } as const;

  if (input.active) {
    // Only undo deactivation that this account lifecycle introduced. An
    // independently inactive player must stay inactive for explicit review.
    if (player.status === "ACTIVE" || player.accountLifecycleDeactivatedAt === null) {
      return { changed: false, status: player.status } as const;
    }
    const rows = await transaction
      .update(players)
      .set({
        status: "ACTIVE",
        deactivatedAt: null,
        accountLifecycleDeactivatedAt: null,
        revision: sql`${players.revision} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(players.id, player.id),
          eq(players.status, "INACTIVE"),
          isNotNull(players.accountLifecycleDeactivatedAt),
        ),
      )
      .returning({ id: players.id });
    if (rows.length !== 1) throw new Error("Lifecycle-deactivated player could not be reactivated.");
  } else {
    if (player.status === "INACTIVE") return { changed: false, status: player.status } as const;
    const rows = await transaction
      .update(players)
      .set({
        status: "INACTIVE",
        deactivatedAt: input.now,
        accountLifecycleDeactivatedAt: input.now,
        revision: sql`${players.revision} + 1`,
        updatedAt: input.now,
      })
      .where(and(eq(players.id, player.id), eq(players.status, "ACTIVE")))
      .returning({ id: players.id });
    if (rows.length !== 1) throw new Error("Linked player could not be lifecycle-deactivated.");
  }

  await transaction.insert(auditEvents).values({
    requestId: input.requestId,
    actorUserAccountId: input.actorId,
    action: input.active
      ? "PLAYER_REACTIVATED_BY_ACCOUNT_LIFECYCLE"
      : "PLAYER_DEACTIVATED_BY_ACCOUNT_LIFECYCLE",
    targetType: "PLAYER",
    targetId: player.id,
    beforeJson: {
      status: player.status,
      accountLifecycleDeactivated: player.accountLifecycleDeactivatedAt !== null,
    },
    afterJson: {
      status: input.active ? "ACTIVE" : "INACTIVE",
      accountLifecycleDeactivated: !input.active,
    },
    metadataJson: { reason: input.reason, userAccountId: input.userAccountId },
    createdAt: input.now,
  });
  return { changed: true, status: input.active ? "ACTIVE" : "INACTIVE" } as const;
}

async function insertStatusHistory(
  transaction: V2Transaction,
  input: {
    actorId: string | null;
    userAccountId: string;
    action: string;
    previousStatus: AccountRow["status"] | null;
    nextStatus: AccountRow["status"];
    publicReason: string | null;
    internalReason: string | null;
    now: Date;
  },
) {
  await transaction.insert(accountStatusHistory).values({
    userAccountId: input.userAccountId,
    actorUserAccountId: input.actorId,
    action: input.action,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    publicReason: input.publicReason,
    internalReason: input.internalReason,
    createdAt: input.now,
  });
}

export class PostgresAccountRepository implements AccountRepository {
  constructor(private readonly database: V2Database) {}

  async authenticateUser(input: UserLoginInput, now: Date): Promise<UserLoginResult> {
    const normalized = normalizeLoginId(input.loginId);
    const rows = await this.database
      .select()
      .from(userAccounts)
      .where(and(eq(userAccounts.loginIdNormalized, normalized), isNull(userAccounts.deletedAt)))
      .limit(1);
    const initial = rows[0] ?? null;
    const verification = await verifyPasswordHashConstantWork(
      input.password,
      initial?.passwordHash ?? null,
    );
    if (!initial || !verification.matches) return { type: "invalid-credentials" };

    const upgradedHash = verification.format === "BCRYPT"
      ? await hashPassword(input.password)
      : null;

    return withTransaction(this.database, async (transaction) => {
      const current = await accountRow(transaction, initial.id, { lock: true });
      if (
        !current ||
        current.passwordHash !== initial.passwordHash ||
        current.authVersion !== initial.authVersion
      ) {
        // A password reset, status/role change, deletion, or another login
        // migration won the race. Never reuse the earlier verification result.
        return { type: "invalid-credentials" };
      }

      if (upgradedHash && current.passwordHash) {
        const migrated = (
          await transaction
            .update(userAccounts)
            .set({ passwordHash: upgradedHash, updatedAt: now })
            .where(
              and(
                eq(userAccounts.id, current.id),
                eq(userAccounts.passwordHash, current.passwordHash),
                eq(userAccounts.authVersion, current.authVersion),
                isNull(userAccounts.deletedAt),
              ),
            )
            .returning({ id: userAccounts.id })
        )[0];
        if (!migrated) return { type: "invalid-credentials" };
        await transaction.insert(auditEvents).values({
          requestId: randomUUID(),
          actorUserAccountId: current.id,
          action: "ACCOUNT_PASSWORD_HASH_UPGRADED",
          targetType: "USER_ACCOUNT_SECURITY",
          targetId: current.id,
          beforeJson: { passwordHashFormat: "BCRYPT" },
          afterJson: { passwordHashFormat: "SCRYPT" },
          metadataJson: { passwordValueChanged: false, concurrencyGuarded: true },
          createdAt: now,
        });
      }

      const dto = await accountDto(transaction, current.id);
      if (!dto) return { type: "invalid-credentials" };
      return {
        type: "authenticated",
        account: selfDto(dto),
        session: {
          userId: current.id,
          role: current.role,
          purpose: "ACCOUNT",
          accountStatus: current.status,
          mustChangePassword: current.mustChangePassword,
          authVersion: current.authVersion,
          adminTotpVerified: false,
          source: "database",
        },
      };
    });
  }

  async findSelf(userAccountId: string): Promise<AccountSelfDto | null> {
    const dto = await accountDto(this.database, userAccountId);
    return dto ? selfDto(dto) : null;
  }

  async findSelfParticipations(userAccountId: string): Promise<readonly AccountParticipationDto[]> {
    const [eventRows, destructionRows, player] = await Promise.all([
      this.database.select({
        id: eventCompetitions.id,
        title: eventCompetitions.title,
        status: eventCompetitions.status,
        occurredOn: eventCompetitions.updatedAt,
      }).from(eventParticipantIndex)
        .innerJoin(eventCompetitions, eq(eventCompetitions.id, eventParticipantIndex.eventId))
        .where(and(eq(eventParticipantIndex.ownerUserAccountId, userAccountId), eq(eventParticipantIndex.status, "ACTIVE")))
        .orderBy(desc(eventCompetitions.updatedAt), desc(eventCompetitions.id)).limit(8),
      this.database.select({
        id: destructionCompetitions.id,
        title: destructionCompetitions.title,
        status: destructionCompetitions.status,
        applicationStatus: destructionApplicationIndex.status,
        occurredOn: destructionCompetitions.updatedAt,
      }).from(destructionApplicationIndex)
        .innerJoin(destructionCompetitions, eq(destructionCompetitions.id, destructionApplicationIndex.tournamentId))
        .where(and(
          eq(destructionApplicationIndex.ownerUserAccountId, userAccountId),
          inArray(destructionApplicationIndex.status, ["APPLIED", "CONFIRMED", "RESERVE"]),
        )).orderBy(desc(destructionCompetitions.updatedAt), desc(destructionCompetitions.id)).limit(8),
      this.database.select({ id: players.id }).from(players).where(eq(players.userAccountId, userAccountId)).limit(1),
    ]);
    const matchRows = player[0]
      ? await this.database.selectDistinct({
        id: matchSeries.id,
        title: matchSeries.title,
        status: matchSeries.status,
        occurredOn: matchSeries.playedOn,
      }).from(matchParticipants)
        .innerJoin(matchGames, eq(matchGames.id, matchParticipants.gameId))
        .innerJoin(matchSeries, eq(matchSeries.id, matchGames.seriesId))
        .where(and(eq(matchParticipants.playerId, player[0].id), eq(matchSeries.status, "PUBLISHED")))
        .orderBy(desc(matchSeries.playedOn), desc(matchSeries.id)).limit(12)
      : [];
    return Object.freeze([
      ...eventRows.map((row) => ({ kind: "EVENT" as const, id: row.id, title: row.title, status: row.status, occurredOn: row.occurredOn.toISOString() })),
      ...destructionRows.map((row) => ({ kind: "DESTRUCTION" as const, id: row.id, title: row.title, status: `${row.status}:${row.applicationStatus}`, occurredOn: row.occurredOn.toISOString() })),
      ...matchRows.map((row) => ({ kind: "MATCH" as const, id: row.id, title: row.title, status: row.status, occurredOn: row.occurredOn })),
    ].sort((left, right) => right.occurredOn.localeCompare(left.occurredOn, "en-US")).slice(0, 18));
  }

  async updateOwnPlayer(
    input: OwnPlayerInput,
    expectedPlayerRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        if (!command.actorSession || command.actorUserAccountId !== command.actorSession.userAccountId) {
          return { type: "session-stale" };
        }
        const actor = await lockTransactionSessionActor(
          transaction,
          command.actorSession,
          command.now,
          APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
        );
        if (!actor) return { type: "session-stale" };

        const scope = accountMutationScope("self-player", actor.id);
        const started = await startMutation(transaction, command, scope);
        if (started.replay) return started.replay;

        const before = (
          await transaction
            .select()
            .from(players)
            .where(and(eq(players.userAccountId, actor.id), eq(players.status, "ACTIVE")))
            .for("update")
            .limit(1)
        )[0];
        if (!before) return { type: "not-found" };
        if (before.revision !== expectedPlayerRevision) {
          return { type: "precondition-failed", currentRevision: before.revision };
        }

        const riotIdentityChange = await disconnectConnectedRiotIdentityForPlayer(transaction, {
          playerId: before.id,
          nextGameName: input.nickname,
          nextTagLine: input.tagLine,
          actorUserAccountId: actor.id,
          requestId: command.requestId,
          now: command.now,
          source: "OWNER_PROFILE",
        });

        const updated = (
          await transaction
            .update(players)
            .set({
              nickname: input.nickname,
              nicknameNormalized: normalizeAccountIdentity(input.nickname),
              tagLine: input.tagLine,
              tagLineNormalized: normalizeAccountIdentity(input.tagLine),
              peakTier: input.peakTier,
              currentTier: input.currentTier,
              revision: sql`${players.revision} + 1`,
              updatedAt: command.now,
            })
            .where(and(
              eq(players.id, before.id),
              eq(players.userAccountId, actor.id),
              eq(players.revision, expectedPlayerRevision),
            ))
            .returning({ revision: players.revision })
        )[0];
        if (!updated) return { type: "precondition-failed", currentRevision: before.revision };

        await transaction.insert(auditEvents).values({
          requestId: command.requestId,
          actorUserAccountId: actor.id,
          action: "PLAYER_SELF_UPDATED",
          targetType: "PLAYER",
          targetId: before.id,
          beforeJson: {
            riotId: `${before.nickname}#${before.tagLine}`,
            peakTier: before.peakTier,
            currentTier: before.currentTier,
            revision: before.revision,
          },
          afterJson: {
            riotId: `${input.nickname}#${input.tagLine}`,
            peakTier: input.peakTier,
            currentTier: input.currentTier,
            revision: updated.revision,
          },
          metadataJson: { ownerMutation: true },
          createdAt: command.now,
        });
        const dto = await accountDto(transaction, actor.id);
        if (!dto) throw new Error("Updated owner player could not be reloaded.");
        const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
          type: "success",
          status: 200,
          response: {
            message: riotIdentityChange.disconnected
              ? "내 Riot ID와 티어 정보가 수정되었습니다. Riot ID가 변경되어 기존 Riot 연동이 해제되었습니다. 새 Riot ID를 다시 연동해 주세요."
              : "내 Riot ID와 티어 정보가 수정되었습니다.",
            account: selfDto(dto),
            playerRevision: updated.revision,
          },
          revision: updated.revision,
          replayed: false,
        };
        await saveReceipt(transaction, command, started.identity, outcome);
        return outcome;
      });
    } catch (error) {
      if (errorConstraint(error) === "players_nickname_tag_line_normalized_uidx") {
        return { type: "conflict", reason: "RIOT_ID_ALREADY_LINKED" };
      }
      throw error;
    }
  }

  async listAdmin(
    query: AdminAccountListQuery,
    viewerRole: "ADMIN" | "SUPER_ADMIN",
  ) {
    const predicates = [];
    if (query.status !== "ALL") predicates.push(eq(userAccounts.status, query.status));
    if (query.role !== "ALL") predicates.push(eq(userAccounts.role, query.role));
    if (query.deleted === "ACTIVE") predicates.push(isNull(userAccounts.deletedAt));
    if (query.deleted === "DELETED") predicates.push(isNotNull(userAccounts.deletedAt));
    const normalizedQuery = normalizeAccountIdentity(query.query);
    if (normalizedQuery) {
      const prefix = escapeLikePrefix(normalizedQuery);
      const riotId = sql<string>`${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`;
      const legacyId = parseLegacyAccountIntegerId(normalizedQuery);
      const claimMatches = sql<boolean>`exists (
        select 1
        from registry.player_account_claims claim_search
        inner join registry.players claim_player
          on claim_player.id = claim_search.player_id
        where claim_search.user_account_id = ${userAccounts.id}
          and (
            claim_player.member_name_normalized like ${prefix}
            or claim_player.nickname_normalized like ${prefix}
            or claim_player.tag_line_normalized like ${prefix}
            or (claim_player.nickname_normalized || '#' || claim_player.tag_line_normalized) like ${prefix}
          )
      )`;
      predicates.push(
        or(
          like(userAccounts.loginIdNormalized, prefix),
          like(players.memberNameNormalized, prefix),
          like(players.nicknameNormalized, prefix),
          like(players.tagLineNormalized, prefix),
          like(riotId, prefix),
          claimMatches,
          legacyId !== null ? eq(userAccounts.legacyId, legacyId) : undefined,
        )!,
      );
    }
    const predicate = predicates.length ? and(...predicates) : undefined;
    const totalRows = await this.database
      .select({ value: count() })
      .from(userAccounts)
      .leftJoin(players, eq(players.userAccountId, userAccounts.id))
      .where(predicate);
    const totalCount = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const currentPage = Math.min(query.page, totalPages);
    const idRows = await this.database
      .select({ id: userAccounts.id })
      .from(userAccounts)
      .leftJoin(players, eq(players.userAccountId, userAccounts.id))
      .where(predicate)
      .orderBy(desc(userAccounts.updatedAt), asc(userAccounts.loginIdNormalized))
      .limit(query.pageSize)
      .offset((currentPage - 1) * query.pageSize);
    const dtoById = await accountDtos(this.database, idRows.map(({ id }) => id), true);
    const items = idRows
      .map(({ id }) => {
        const dto = dtoById.get(id);
        return dto ? adminViewerDto(dto, viewerRole) : undefined;
      })
      .filter((item): item is AdminAccountDto => item !== undefined);
    return { items, totalCount, currentPage, totalPages, pageSize: query.pageSize };
  }

  async findAdmin(
    userAccountId: string,
    viewerRole: "ADMIN" | "SUPER_ADMIN",
  ) {
    const dto = await accountDto(this.database, userAccountId, true);
    return dto ? adminViewerDto(dto, viewerRole) : null;
  }

  async resolveLegacyId(legacyId: number) {
    if (!Number.isSafeInteger(legacyId) || legacyId < 1 || legacyId > 2_147_483_647) return null;
    const row = (
      await this.database
        .select({ id: userAccounts.id })
        .from(userAccounts)
        .where(eq(userAccounts.legacyId, legacyId))
        .limit(1)
    )[0];
    return row?.id ?? null;
  }

  async resolvePlayerAccount(playerIdOrLegacyId: string) {
    const legacyId = parseLegacyAccountIntegerId(playerIdOrLegacyId);
    if (legacyId === null && !isCanonicalAccountUuid(playerIdOrLegacyId)) return null;
    const condition = legacyId !== null
      ? eq(players.legacyId, legacyId)
      : eq(players.id, playerIdOrLegacyId);
    const row = (
      await this.database
        .select({ userAccountId: players.userAccountId })
        .from(players)
        .where(condition)
        .limit(1)
    )[0];
    return row?.userAccountId ?? null;
  }

  async signup(
    input: SignupInput,
    passwordHash: string,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        const started = await startMutation(transaction, command, "account:signup");
        if (started.replay) return started.replay;

        const existingAccount = (
          await transaction
            .select({ id: userAccounts.id })
            .from(userAccounts)
            .where(eq(userAccounts.loginIdNormalized, input.loginIdNormalized))
            .for("update")
            .limit(1)
        )[0];
        if (existingAccount) return { type: "conflict", reason: "LOGIN_ID_EXISTS" };

        const existingPlayer = (
          await transaction
            .select()
            .from(players)
            .where(
              and(
                eq(players.nicknameNormalized, input.nicknameNormalized),
                eq(players.tagLineNormalized, input.tagLineNormalized),
              ),
            )
            .for("update")
            .limit(1)
        )[0];
        if (existingPlayer?.userAccountId) {
          return { type: "conflict", reason: "RIOT_ID_ALREADY_LINKED" };
        }

        // A brand-new Riot identity can be activated with its new account in
        // the same transaction. An existing unowned identity remains a manual
        // claim so signup cannot take over another player's record.
        const requiresManualPlayerClaim = existingPlayer !== undefined;
        const initialAccountStatus = requiresManualPlayerClaim ? "PENDING" : "APPROVED";
        const initialStatusReason = requiresManualPlayerClaim
          ? "기존 플레이어 연결을 관리자에게 확인하고 있습니다."
          : "가입과 동시에 자동 승인되었습니다.";
        const accountId = randomUUID();
        await transaction.insert(userAccounts).values({
          id: accountId,
          loginId: input.loginId,
          loginIdNormalized: input.loginIdNormalized,
          passwordHash,
          role: "USER",
          status: initialAccountStatus,
          revision: requiresManualPlayerClaim ? 0 : 1,
          passwordChangedAt: command.now,
          statusChangedAt: command.now,
          statusReasonPublic: initialStatusReason,
          termsAcceptedAt: command.now,
          termsVersion: ACCOUNT_TERMS_VERSION,
          privacyAcceptedAt: command.now,
          privacyVersion: ACCOUNT_PRIVACY_VERSION,
          createdAt: command.now,
          updatedAt: command.now,
        });

        let claimCreated = false;
        if (existingPlayer) {
          await transaction.insert(playerAccountClaims).values({
            id: randomUUID(),
            userAccountId: accountId,
            playerId: existingPlayer.id,
            requestedMemberName: input.memberName,
            requestedRiotId: `${input.nickname}#${input.tagLine}`,
            status: "PENDING",
            createdAt: command.now,
            updatedAt: command.now,
          });
          claimCreated = true;
        } else {
          await transaction.insert(players).values({
            id: randomUUID(),
            userAccountId: accountId,
            memberName: input.memberName,
            memberNameNormalized: input.memberNameNormalized,
            nickname: input.nickname,
            nicknameNormalized: input.nicknameNormalized,
            tagLine: input.tagLine,
            tagLineNormalized: input.tagLineNormalized,
            status: "ACTIVE",
            deactivatedAt: null,
            accountLifecycleDeactivatedAt: null,
            createdAt: command.now,
            updatedAt: command.now,
          });
        }

        await insertStatusHistory(transaction, {
          actorId: accountId,
          userAccountId: accountId,
          action: "ACCOUNT_SIGNUP_SUBMITTED",
          previousStatus: null,
          nextStatus: "PENDING",
          publicReason: claimCreated
            ? initialStatusReason
            : "가입 정보가 접수되었습니다.",
          internalReason: claimCreated
            ? "기존 플레이어 식별자가 있어 소유권 수동 검토가 필요합니다."
            : "신규 플레이어와 함께 가입 정보가 접수되었습니다.",
          now: command.now,
        });
        if (!claimCreated) {
          await insertStatusHistory(transaction, {
            actorId: accountId,
            userAccountId: accountId,
            action: "ACCOUNT_SIGNUP_AUTO_APPROVED",
            previousStatus: "PENDING",
            nextStatus: "APPROVED",
            publicReason: initialStatusReason,
            internalReason: "신규 플레이어 생성과 계정 자동 승인이 같은 transaction에서 완료되었습니다.",
            now: command.now,
          });
        }
        await transaction.insert(auditEvents).values({
          requestId: command.requestId,
          actorUserAccountId: accountId,
          action: "ACCOUNT_SIGNUP_SUBMITTED",
          targetType: "USER_ACCOUNT",
          targetId: accountId,
          afterJson: { id: accountId, role: "USER", status: "PENDING", revision: 0 },
          metadataJson: {
            playerBinding: claimCreated ? "PENDING_MANUAL_CLAIM" : "NEW_PLAYER_CREATED",
            approvalMode: claimCreated ? "MANUAL_PLAYER_CLAIM" : "AUTOMATIC_SIGNUP_PENDING",
            ownershipVerified: false,
            termsVersion: ACCOUNT_TERMS_VERSION,
            privacyVersion: ACCOUNT_PRIVACY_VERSION,
          },
          createdAt: command.now,
        });
        if (!claimCreated) {
          await transaction.insert(auditEvents).values({
            requestId: command.requestId,
            actorUserAccountId: accountId,
            action: "ACCOUNT_SIGNUP_AUTO_APPROVED",
            targetType: "USER_ACCOUNT",
            targetId: accountId,
            beforeJson: { id: accountId, role: "USER", status: "PENDING", revision: 0 },
            afterJson: { id: accountId, role: "USER", status: "APPROVED", revision: 1 },
            metadataJson: {
              playerBinding: "NEW_PLAYER_CREATED",
              approvalMode: "AUTOMATIC_SIGNUP",
              ownershipVerified: false,
              termsVersion: ACCOUNT_TERMS_VERSION,
              privacyVersion: ACCOUNT_PRIVACY_VERSION,
            },
            createdAt: command.now,
          });
        }

        const dto = await accountDto(transaction, accountId);
        if (!dto) throw new Error("Signed-up account could not be reloaded.");
        const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
          type: "success",
          status: 201,
          response: {
            message: claimCreated
              ? "가입 신청이 접수되었습니다. 기존 플레이어 연결은 관리자 수동 검토 후 확정됩니다."
              : "가입과 자동 승인이 완료되었습니다. 로그인 후 서비스를 이용해 주세요.",
            account: selfDto(dto),
          },
          revision: dto.revision,
          replayed: false,
        };
        await saveReceipt(transaction, command, started.identity, outcome, accountId);
        return outcome;
      });
    } catch (error) {
      const constraint = errorConstraint(error);
      if (constraint === "user_accounts_login_id_normalized_uidx") {
        return { type: "conflict", reason: "LOGIN_ID_EXISTS" };
      }
      if (
        constraint === "player_account_claims_pending_player_uidx" ||
        constraint === "player_account_claims_pending_account_uidx"
      ) {
        return { type: "conflict", reason: "PLAYER_CLAIM_PENDING" };
      }
      if (constraint === "players_nickname_tag_line_normalized_uidx") {
        return { type: "conflict", reason: "RIOT_ID_ALREADY_LINKED" };
      }
      throw error;
    }
  }

  async requestPasswordReset(
    normalizedLoginId: string,
    loginIdHash: Uint8Array,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      // Mark domain admission before receipt/advisory-lock work. A credential
      // change that commits while this HTTP intent waits must still supersede
      // the older recovery attempt.
      const databaseAdmissionClock = await transactionClock(transaction);
      // The HTTP command is created before the repository competes for a pool
      // connection. Use the earlier trusted boundary so a request already
      // admitted by the application cannot become "new" merely because the
      // pool or receipt lock was busy. A future-skewed app clock is capped by
      // the database clock; an older clock only fails closed.
      const admittedAt = new Date(Math.min(command.now.getTime(), databaseAdmissionClock.getTime()));
      const started = await startMutation(transaction, command, "account:reset-request");
      if (started.replay) return started.replay;

      const account = (
        await transaction
          .select()
          .from(userAccounts)
          .where(
            and(
              eq(userAccounts.loginIdNormalized, normalizedLoginId),
              isNull(userAccounts.deletedAt),
            ),
          )
          .for("update")
          .limit(1)
      )[0];
      const supersededByPasswordChange = account?.passwordChangedAt !== null &&
        account?.passwordChangedAt !== undefined &&
        account.passwordChangedAt.getTime() >= admittedAt.getTime();
      if (account && !supersededByPasswordChange) {
        // The request may have waited on the account row. Use the database wall
        // clock only after that lock is acquired so a request which expired
        // while queued cannot suppress a fresh recovery intent.
        await transaction
          .update(passwordResetRequests)
          .set({ status: "EXPIRED", resolvedAt: sql`clock_timestamp()` })
          .where(
            and(
              eq(passwordResetRequests.userAccountId, account.id),
              eq(passwordResetRequests.status, "PENDING"),
              sql<boolean>`${passwordResetRequests.expiresAt} <= clock_timestamp()`,
            ),
          );
        const active = (
          await transaction
            .select({ id: passwordResetRequests.id })
            .from(passwordResetRequests)
            .where(
              and(
                eq(passwordResetRequests.userAccountId, account.id),
                eq(passwordResetRequests.status, "PENDING"),
                sql<boolean>`${passwordResetRequests.expiresAt} > clock_timestamp()`,
              ),
            )
            .limit(1)
        )[0];
        if (!active) {
          const requestId = randomUUID();
          await transaction.insert(passwordResetRequests).values({
            id: requestId,
            userAccountId: account.id,
            loginIdHash: Buffer.from(loginIdHash),
            status: "PENDING",
            requestedAt: sql`clock_timestamp()`,
            expiresAt: sql`clock_timestamp() + (${resetRequestLifetimeMs} * interval '1 millisecond')`,
          });
          await transaction.insert(auditEvents).values({
            requestId: command.requestId,
            actorUserAccountId: null,
            action: "PASSWORD_RESET_REQUESTED",
            targetType: "USER_ACCOUNT",
            targetId: account.id,
            metadataJson: { requestId, enumerationSafe: true },
            createdAt: sql`clock_timestamp()`,
          });
        }
      }

      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 202,
        response: {
          message: "입력한 정보와 일치하는 계정이 있으면 관리자 검토 목록에 요청이 등록됩니다.",
        },
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome, account?.id ?? null);
      return outcome;
    });
  }

  async changeOwnPassword(
    input: PasswordChangeInput,
    nextPasswordHash: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      const actor = await lockSelfActor(transaction, command);
      if (!actor) return { type: "session-stale" };
      const started = await startMutation(transaction, command, "account:password-change");
      if (started.replay) return started.replay;
      if (actor.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: actor.revision };
      }
      const verification = await verifyPasswordHash(input.currentPassword, actor.passwordHash);
      if (!verification.matches) return { type: "invalid-current-password" };
      const dbNow = await transactionClock(transaction);

      const updatedRows = await transaction
        .update(userAccounts)
        .set({
          passwordHash: nextPasswordHash,
          mustChangePassword: false,
          passwordChangedAt: dbNow,
          authVersion: sql`${userAccounts.authVersion} + 1`,
          revision: sql`${userAccounts.revision} + 1`,
          updatedAt: dbNow,
        })
        .where(and(eq(userAccounts.id, actor.id), eq(userAccounts.revision, expectedRevision)))
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        const current = await accountRow(transaction, actor.id);
        return current
          ? { type: "precondition-failed", currentRevision: current.revision }
          : { type: "not-found" };
      }
      const cancelledResetRequests = await transaction
        .update(passwordResetRequests)
        .set({
          status: "CANCELLED",
          resolvedAt: dbNow,
          resolvedByUserAccountId: actor.id,
        })
        .where(
          and(
            eq(passwordResetRequests.userAccountId, actor.id),
            eq(passwordResetRequests.status, "PENDING"),
          ),
        )
        .returning({ id: passwordResetRequests.id });
      const revoked = await revokeAllSessions(transaction, actor.id, dbNow);
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: actor.id,
        action: "ACCOUNT_PASSWORD_CHANGED",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: actor.id,
        beforeJson: { revision: actor.revision, mustChangePassword: actor.mustChangePassword },
        afterJson: { revision: updated.revision, mustChangePassword: false },
        metadataJson: {
          previousHashFormat: verification.format,
          nextHashFormat: "SCRYPT",
          revokedSessionCount: revoked.length,
          cancelledPasswordResetRequestCount: cancelledResetRequests.length,
        },
        createdAt: dbNow,
      });
      if (cancelledResetRequests.length > 0) {
        await transaction.insert(auditEvents).values({
          requestId: command.requestId,
          actorUserAccountId: actor.id,
          action: "PASSWORD_RESET_REQUESTS_CANCELLED_ON_PASSWORD_CHANGE",
          targetType: "USER_ACCOUNT_SECURITY",
          targetId: actor.id,
          beforeJson: { pendingRequestCount: cancelledResetRequests.length },
          afterJson: { pendingRequestCount: 0 },
          metadataJson: {
            requestIds: cancelledResetRequests.map((request) => request.id),
            resolver: "SELF_PASSWORD_CHANGE",
          },
          createdAt: dbNow,
        });
      }
      const dto = await accountDto(transaction, actor.id);
      if (!dto) throw new Error("Password-changed account could not be reloaded.");
      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: {
          message: "비밀번호가 변경되었습니다. 모든 기기에서 다시 로그인해 주세요.",
          account: selfDto(dto),
        },
        revision: updated.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }

  async changeStatus(
    userAccountId: string,
    nextStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED",
    reason: AccountStatusInput,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      const locked = await lockAdminActorAndTarget(transaction, command, userAccountId);
      const actor = locked.actor;
      if (!actor) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        `account:status-${nextStatus.toLowerCase()}:${userAccountId}`,
      );
      if (started.replay) return started.replay;
      const target = locked.target;
      if (!target) return { type: "not-found" };
      if (!adminMayMutateTarget(actor, target)) {
        return { type: "forbidden", reason: "TARGET_POLICY" };
      }
      if (nextStatus !== "APPROVED" && !loginConfirmationMatches(target, reason.confirmLoginId)) {
        return { type: "conflict", reason: "TARGET_CONFIRMATION_MISMATCH" };
      }
      if (target.deletedAt) return { type: "conflict", reason: "ACCOUNT_DELETED" };
      if (target.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: target.revision };
      }
      if (target.status === nextStatus && nextStatus !== "PENDING") {
        return { type: "conflict", reason: "STATUS_UNCHANGED" };
      }

      if (nextStatus === "PENDING") {
        const claimReopen = await reopenLatestRejectedClaim(transaction, {
          actorId: actor.id,
          userAccountId: target.id,
          requestId: command.requestId,
          now: command.now,
        });
        if (!claimReopen.ok) return { type: "conflict", reason: claimReopen.reason };
        if (target.status === "PENDING" && !claimReopen.reopened) {
          return { type: "conflict", reason: "STATUS_UNCHANGED" };
        }
        await setLinkedPlayerAccountLifecycle(transaction, {
          actorId: actor.id,
          userAccountId: target.id,
          requestId: command.requestId,
          now: command.now,
          active: false,
          reason: "ACCOUNT_PENDING",
        });
      }

      if (nextStatus === "APPROVED") {
        const linkedPlayer = (
          await transaction
            .select()
            .from(players)
            .where(eq(players.userAccountId, target.id))
            .for("update")
            .limit(1)
        )[0];
        if (!linkedPlayer) {
          const claimCandidate = (
            await transaction
              .select()
              .from(playerAccountClaims)
              .where(
                and(
                  eq(playerAccountClaims.userAccountId, target.id),
                  eq(playerAccountClaims.status, "PENDING"),
                ),
              )
              .limit(1)
          )[0];
          if (!claimCandidate) return { type: "conflict", reason: "ACTIVE_PLAYER_REQUIRED" };
          if (
            reason.expectedClaimId !== claimCandidate.id ||
            reason.claimOwnershipReviewed !== true
          ) {
            return { type: "conflict", reason: "PLAYER_CLAIM_ACK_REQUIRED" };
          }
          const claimedPlayer = (
            await transaction
              .select()
              .from(players)
              .where(eq(players.id, claimCandidate.playerId))
              .for("update")
              .limit(1)
          )[0];
          if (!claimedPlayer || claimedPlayer.userAccountId) {
            return { type: "conflict", reason: "PLAYER_CLAIM_TAKEN" };
          }
          const claim = (
            await transaction
              .select()
              .from(playerAccountClaims)
              .where(
                and(
                  eq(playerAccountClaims.id, claimCandidate.id),
                  eq(playerAccountClaims.userAccountId, target.id),
                  eq(playerAccountClaims.playerId, claimedPlayer.id),
                  eq(playerAccountClaims.status, "PENDING"),
                ),
              )
              .for("update")
              .limit(1)
          )[0];
          if (!claim) return { type: "conflict", reason: "PLAYER_CLAIM_STATE_CHANGED" };
          // A claim acknowledgement proves only that an administrator reviewed the
          // requested link. It must not override an independent operational
          // deactivation. S02 must explicitly reactivate that player first; only
          // account-lifecycle deactivations may be restored as part of approval.
          if (
            claimedPlayer.status === "INACTIVE" &&
            claimedPlayer.accountLifecycleDeactivatedAt === null
          ) {
            return { type: "conflict", reason: "ACTIVE_PLAYER_REQUIRED" };
          }
          const linked = await transaction
            .update(players)
            .set({
              userAccountId: target.id,
              status: "ACTIVE",
              deactivatedAt: null,
              accountLifecycleDeactivatedAt: null,
              revision: sql`${players.revision} + 1`,
              updatedAt: command.now,
            })
            .where(and(eq(players.id, claimedPlayer.id), isNull(players.userAccountId)))
            .returning({ id: players.id });
          if (linked.length !== 1) throw new Error("Claimed player could not be linked.");
          const reviewed = await transaction
            .update(playerAccountClaims)
            .set({
              status: "APPROVED",
              reviewedByUserAccountId: actor.id,
              reviewedAt: command.now,
              updatedAt: command.now,
            })
            .where(
              and(
                eq(playerAccountClaims.id, claim.id),
                eq(playerAccountClaims.status, "PENDING"),
              ),
            )
            .returning({ id: playerAccountClaims.id });
          if (reviewed.length !== 1) throw new Error("Player claim could not be approved.");
          await transaction.insert(auditEvents).values({
            requestId: command.requestId,
            actorUserAccountId: actor.id,
            action: "PLAYER_ACCOUNT_CLAIM_APPROVED",
            targetType: "PLAYER_ACCOUNT_CLAIM",
            targetId: claim.id,
            beforeJson: {
              playerId: claimedPlayer.id,
              linked: false,
              playerStatus: claimedPlayer.status,
            },
            afterJson: { playerId: claimedPlayer.id, linked: true, playerStatus: "ACTIVE" },
            metadataJson: {
              ownershipVerified: false,
              reviewMode: "MANUAL_ADMIN",
              manualEvidenceAcknowledged: true,
              expectedClaimId: claim.id,
            },
            createdAt: command.now,
          });
        } else {
          if (
            reason.expectedClaimId !== null ||
            reason.claimOwnershipReviewed !== false
          ) {
            return { type: "conflict", reason: "PLAYER_CLAIM_STATE_CHANGED" };
          }
          if (
            linkedPlayer.status !== "ACTIVE" &&
            linkedPlayer.accountLifecycleDeactivatedAt === null
          ) {
            return { type: "conflict", reason: "ACTIVE_PLAYER_REQUIRED" };
          }
          await setLinkedPlayerAccountLifecycle(transaction, {
            actorId: actor.id,
            userAccountId: target.id,
            requestId: command.requestId,
            now: command.now,
            active: true,
            reason: "ACCOUNT_APPROVED",
          });
        }
      }

      if (nextStatus === "REJECTED") {
        const rejectedClaims = await transaction
          .update(playerAccountClaims)
          .set({
            status: "REJECTED",
            reviewedByUserAccountId: actor.id,
            reviewedAt: command.now,
            updatedAt: command.now,
          })
          .where(
            and(
              eq(playerAccountClaims.userAccountId, target.id),
              eq(playerAccountClaims.status, "PENDING"),
            ),
          )
          .returning({
            id: playerAccountClaims.id,
            playerId: playerAccountClaims.playerId,
          });
        if (rejectedClaims.length > 0) {
          await transaction.insert(auditEvents).values(rejectedClaims.map((claim) => ({
            requestId: command.requestId,
            actorUserAccountId: actor.id,
            action: "PLAYER_ACCOUNT_CLAIM_REJECTED",
            targetType: "PLAYER_ACCOUNT_CLAIM",
            targetId: claim.id,
            beforeJson: {
              status: "PENDING",
              playerId: claim.playerId,
              userAccountId: target.id,
            },
            afterJson: {
              status: "REJECTED",
              playerId: claim.playerId,
              userAccountId: target.id,
              reviewedByUserAccountId: actor.id,
              reviewedAt: command.now.toISOString(),
            },
            metadataJson: {
              accountStatusTransition: "REJECTED",
              internalReason: reason.internalReason,
              reasonRecorded: true,
              ownershipVerified: false,
            },
            createdAt: command.now,
          })));
        }
        await setLinkedPlayerAccountLifecycle(transaction, {
          actorId: actor.id,
          userAccountId: target.id,
          requestId: command.requestId,
          now: command.now,
          active: false,
          reason: "ACCOUNT_REJECTED",
        });
      }

      const updatedRows = await transaction
        .update(userAccounts)
        .set({
          status: nextStatus,
          statusChangedAt: command.now,
          statusReasonPublic: reason.publicReason,
          statusReasonInternal: reason.internalReason,
          authVersion: sql`${userAccounts.authVersion} + 1`,
          revision: sql`${userAccounts.revision} + 1`,
          updatedAt: command.now,
        })
        .where(and(eq(userAccounts.id, target.id), eq(userAccounts.revision, expectedRevision)))
        .returning();
      const updated = updatedRows[0];
      if (!updated) {
        throw new Error("Locked status target could not be updated.");
      }
      const revoked = await revokeAllSessions(transaction, target.id, command.now);
      const action = `ACCOUNT_STATUS_${nextStatus}`;
      await insertStatusHistory(transaction, {
        actorId: actor.id,
        userAccountId: target.id,
        action,
        previousStatus: target.status,
        nextStatus,
        publicReason: reason.publicReason,
        internalReason: reason.internalReason,
        now: command.now,
      });
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: actor.id,
        action,
        targetType: "USER_ACCOUNT",
        targetId: target.id,
        beforeJson: auditAccountSnapshot(target),
        afterJson: auditAccountSnapshot(updated),
        metadataJson: {
          revokedSessionCount: revoked.length,
          reasonRecorded: true,
          suspendedPlayerVisibilityPolicy: nextStatus === "SUSPENDED"
            ? "PRESERVE_PUBLIC_REGISTRY_RECORD"
            : undefined,
        },
        createdAt: command.now,
      });
      const dto = await accountDto(transaction, target.id, true);
      if (!dto) throw new Error("Status-updated account could not be reloaded.");
      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: { message: "계정 상태가 변경되었습니다.", account: dto },
        revision: updated.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }

  async changeRole(
    userAccountId: string,
    nextRole: "USER" | "ADMIN",
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      const locked = await lockAdminActorAndTarget(transaction, command, userAccountId);
      const actor = locked.actor;
      if (!actor) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        `account:role:${userAccountId}`,
      );
      if (started.replay) return started.replay;
      if (actor.role !== "SUPER_ADMIN") return { type: "forbidden", reason: "SUPER_REQUIRED" };
      const target = locked.target;
      if (!target) return { type: "not-found" };
      if (target.id === actor.id || target.role === "SUPER_ADMIN") {
        return { type: "forbidden", reason: "TARGET_POLICY" };
      }
      if (!loginConfirmationMatches(target, confirmLoginId)) {
        return { type: "conflict", reason: "TARGET_CONFIRMATION_MISMATCH" };
      }
      if (target.deletedAt) return { type: "conflict", reason: "ACCOUNT_DELETED" };
      if (target.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: target.revision };
      }
      if (target.role === nextRole) return { type: "conflict", reason: "ROLE_UNCHANGED" };
      if (nextRole === "ADMIN" && target.status !== "APPROVED") {
        return { type: "conflict", reason: "ADMIN_ELIGIBILITY" };
      }
      const updated = (
        await transaction
          .update(userAccounts)
          .set({
            role: nextRole,
            authVersion: sql`${userAccounts.authVersion} + 1`,
            revision: sql`${userAccounts.revision} + 1`,
            updatedAt: command.now,
          })
          .where(and(eq(userAccounts.id, target.id), eq(userAccounts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) {
        const current = await accountRow(transaction, target.id, { includeDeleted: true });
        return current
          ? { type: "precondition-failed", currentRevision: current.revision }
          : { type: "not-found" };
      }
      if (nextRole === "USER") {
        await transaction
          .delete(adminTotpCredentials)
          .where(eq(adminTotpCredentials.userAccountId, target.id));
      }
      const revoked = await revokeAllSessions(transaction, target.id, command.now);
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: actor.id,
        action: "ACCOUNT_ROLE_CHANGED",
        targetType: "USER_ACCOUNT",
        targetId: target.id,
        beforeJson: auditAccountSnapshot(target),
        afterJson: auditAccountSnapshot(updated),
        metadataJson: {
          internalReason,
          revokedSessionCount: revoked.length,
          totpRemoved: nextRole === "USER",
        },
        createdAt: command.now,
      });
      const dto = await accountDto(transaction, target.id, true);
      if (!dto) throw new Error("Role-updated account could not be reloaded.");
      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: { message: "계정 역할이 변경되었습니다.", account: dto },
        revision: updated.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }

  async resetPassword(
    userAccountId: string,
    temporaryPasswordHash: string,
    temporaryPassword: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      const locked = await lockAdminActorAndTarget(transaction, command, userAccountId);
      const actor = locked.actor;
      if (!actor) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        `account:password-reset:${userAccountId}`,
      );
      if (started.replay) return started.replay;
      if (actor.role !== "SUPER_ADMIN") return { type: "forbidden", reason: "SUPER_REQUIRED" };
      const target = locked.target;
      if (!target) return { type: "not-found" };
      if (target.id === actor.id || target.role === "SUPER_ADMIN") {
        return { type: "forbidden", reason: "TARGET_POLICY" };
      }
      if (!loginConfirmationMatches(target, confirmLoginId)) {
        return { type: "conflict", reason: "TARGET_CONFIRMATION_MISMATCH" };
      }
      if (target.deletedAt) return { type: "conflict", reason: "ACCOUNT_DELETED" };
      if (target.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: target.revision };
      }
      const dbNow = await transactionClock(transaction);
      const updated = (
        await transaction
          .update(userAccounts)
          .set({
            passwordHash: temporaryPasswordHash,
            mustChangePassword: true,
            passwordChangedAt: dbNow,
            authVersion: sql`${userAccounts.authVersion} + 1`,
            revision: sql`${userAccounts.revision} + 1`,
            updatedAt: dbNow,
          })
          .where(and(eq(userAccounts.id, target.id), eq(userAccounts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) {
        const current = await accountRow(transaction, target.id, { includeDeleted: true });
        return current
          ? { type: "precondition-failed", currentRevision: current.revision }
          : { type: "not-found" };
      }
      await transaction
        .update(passwordResetRequests)
        .set({
          status: "RESOLVED",
          resolvedAt: dbNow,
          resolvedByUserAccountId: actor.id,
        })
        .where(
          and(
            eq(passwordResetRequests.userAccountId, target.id),
            eq(passwordResetRequests.status, "PENDING"),
          ),
        );
      const revoked = await revokeAllSessions(transaction, target.id, dbNow);
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: actor.id,
        action: "ACCOUNT_PASSWORD_RESET",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: target.id,
        beforeJson: { revision: target.revision, mustChangePassword: target.mustChangePassword },
        afterJson: { revision: updated.revision, mustChangePassword: true },
        metadataJson: {
          internalReason,
          revokedSessionCount: revoked.length,
          secretPersisted: false,
          nextHashFormat: "SCRYPT",
        },
        createdAt: dbNow,
      });
      const dto = await accountDto(transaction, target.id, true);
      if (!dto) throw new Error("Password-reset account could not be reloaded.");
      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: {
          message: "임시 비밀번호가 발급되었습니다. 이 응답을 닫으면 다시 확인할 수 없습니다.",
          account: dto,
        },
        revision: updated.revision,
        replayed: false,
        oneTimeSecret: temporaryPassword,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }

  async resetAdminTotp(
    userAccountId: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      const locked = await lockAdminActorAndTarget(transaction, command, userAccountId);
      const actor = locked.actor;
      if (!actor) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        `account:2fa-reset:${userAccountId}`,
      );
      if (started.replay) return started.replay;
      if (actor.role !== "SUPER_ADMIN") return { type: "forbidden", reason: "SUPER_REQUIRED" };
      const target = locked.target;
      if (!target) return { type: "not-found" };
      if (target.id === actor.id || target.role !== "ADMIN") {
        return { type: "forbidden", reason: "TARGET_POLICY" };
      }
      if (!loginConfirmationMatches(target, confirmLoginId)) {
        return { type: "conflict", reason: "TARGET_CONFIRMATION_MISMATCH" };
      }
      if (target.deletedAt) return { type: "conflict", reason: "ACCOUNT_DELETED" };
      if (target.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: target.revision };
      }
      const credential = (
        await transaction
          .select({ userAccountId: adminTotpCredentials.userAccountId })
          .from(adminTotpCredentials)
          .where(eq(adminTotpCredentials.userAccountId, target.id))
          .for("update")
          .limit(1)
      )[0];
      if (!credential) return { type: "conflict", reason: "TOTP_NOT_CONFIGURED" };

      await transaction
        .delete(adminTotpCredentials)
        .where(eq(adminTotpCredentials.userAccountId, target.id));
      const updated = (
        await transaction
          .update(userAccounts)
          .set({
            authVersion: sql`${userAccounts.authVersion} + 1`,
            revision: sql`${userAccounts.revision} + 1`,
            updatedAt: command.now,
          })
          .where(and(eq(userAccounts.id, target.id), eq(userAccounts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) {
        throw new Error("Locked TOTP reset target could not be updated.");
      }
      const revoked = await revokeAllSessions(transaction, target.id, command.now);
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: actor.id,
        action: "ADMIN_TOTP_RESET_BY_SUPER",
        targetType: "USER_ACCOUNT_SECURITY",
        targetId: target.id,
        beforeJson: { revision: target.revision, totpStatus: "CONFIGURED" },
        afterJson: { revision: updated.revision, totpStatus: "NOT_CONFIGURED" },
        metadataJson: {
          internalReason,
          revokedSessionCount: revoked.length,
          requiresAdminReenrollment: true,
        },
        createdAt: command.now,
      });
      const dto = await accountDto(transaction, target.id, true);
      if (!dto) throw new Error("TOTP-reset account could not be reloaded.");
      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: {
          message: "관리자 2단계 인증이 초기화되었습니다. 대상 관리자는 다시 등록해야 합니다.",
          account: dto,
        },
        revision: updated.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }

  async softDelete(
    userAccountId: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return this.setDeletedState(
      userAccountId,
      true,
      internalReason,
      confirmLoginId,
      expectedRevision,
      command,
    );
  }

  async restore(
    userAccountId: string,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return this.setDeletedState(
      userAccountId,
      false,
      internalReason,
      confirmLoginId,
      expectedRevision,
      command,
    );
  }

  private async setDeletedState(
    userAccountId: string,
    deleted: boolean,
    internalReason: string,
    confirmLoginId: string,
    expectedRevision: number,
    command: AccountMutationCommand,
  ): Promise<AccountMutationOutcome> {
    return withTransaction(this.database, async (transaction) => {
      const locked = await lockAdminActorAndTarget(transaction, command, userAccountId);
      const actor = locked.actor;
      if (!actor) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        `account:${deleted ? "delete" : "restore"}:${userAccountId}`,
      );
      if (started.replay) return started.replay;
      if (actor.role !== "SUPER_ADMIN") return { type: "forbidden", reason: "SUPER_REQUIRED" };
      const target = locked.target;
      if (!target) return { type: "not-found" };
      if (target.id === actor.id || target.role === "SUPER_ADMIN") {
        return { type: "forbidden", reason: "TARGET_POLICY" };
      }
      if (!loginConfirmationMatches(target, confirmLoginId)) {
        return { type: "conflict", reason: "TARGET_CONFIRMATION_MISMATCH" };
      }
      if (target.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: target.revision };
      }
      if (deleted === (target.deletedAt !== null)) {
        return { type: "conflict", reason: deleted ? "ALREADY_DELETED" : "NOT_DELETED" };
      }
      let releasedClaimCount = 0;
      let cancelledPasswordResetCount = 0;
      let restoredClaimReopened = false;
      if (deleted) {
        const releasedClaims = await transaction
          .update(playerAccountClaims)
          .set({
            status: "REJECTED",
            reviewedByUserAccountId: actor.id,
            reviewedAt: command.now,
            updatedAt: command.now,
          })
          .where(and(
            eq(playerAccountClaims.userAccountId, target.id),
            eq(playerAccountClaims.status, "PENDING"),
          ))
          .returning({ id: playerAccountClaims.id, playerId: playerAccountClaims.playerId });
        releasedClaimCount = releasedClaims.length;
        for (const releasedClaim of releasedClaims) {
          await transaction.insert(auditEvents).values({
            requestId: command.requestId,
            actorUserAccountId: actor.id,
            action: "PLAYER_ACCOUNT_CLAIM_RELEASED_ON_DELETE",
            targetType: "PLAYER_ACCOUNT_CLAIM",
            targetId: releasedClaim.id,
            beforeJson: { status: "PENDING", playerId: releasedClaim.playerId },
            afterJson: { status: "REJECTED", playerId: releasedClaim.playerId },
            metadataJson: {
              ownershipVerified: false,
              releasedForCompetingSignup: true,
              explicitReopenRequiredAfterRestore: true,
            },
            createdAt: command.now,
          });
        }
        await setLinkedPlayerAccountLifecycle(transaction, {
          actorId: actor.id,
          userAccountId: target.id,
          requestId: command.requestId,
          now: command.now,
          active: false,
          reason: "ACCOUNT_SOFT_DELETED",
        });
        const cancelledPasswordResets = await transaction
          .update(passwordResetRequests)
          .set({
            status: "CANCELLED",
            resolvedAt: sql`clock_timestamp()`,
            resolvedByUserAccountId: actor.id,
          })
          .where(and(
            eq(passwordResetRequests.userAccountId, target.id),
            eq(passwordResetRequests.status, "PENDING"),
          ))
          .returning({ id: passwordResetRequests.id });
        cancelledPasswordResetCount = cancelledPasswordResets.length;
        if (cancelledPasswordResetCount > 0) {
          await transaction.insert(auditEvents).values({
            requestId: command.requestId,
            actorUserAccountId: actor.id,
            action: "PASSWORD_RESET_REQUESTS_CANCELLED_ON_DELETE",
            targetType: "USER_ACCOUNT_SECURITY",
            targetId: target.id,
            beforeJson: { pendingRequestCount: cancelledPasswordResetCount },
            afterJson: { pendingRequestCount: 0, terminalStatus: "CANCELLED" },
            metadataJson: { accountSoftDeleted: true, resolverRecorded: true },
            createdAt: command.now,
          });
        }
      } else {
        const claimReopen = await reopenLatestRejectedClaim(transaction, {
          actorId: actor.id,
          userAccountId: target.id,
          requestId: command.requestId,
          now: command.now,
        });
        if (!claimReopen.ok) return { type: "conflict", reason: claimReopen.reason };
        restoredClaimReopened = claimReopen.reopened;
      }
      const nextStatus = deleted ? "REJECTED" : "PENDING";
      const publicReason = deleted
        ? "운영 정책에 따라 계정 이용이 종료되었습니다."
        : "계정이 복구되어 다시 관리자 검토를 기다리고 있습니다.";
      const updated = (
        await transaction
          .update(userAccounts)
          .set({
            deletedAt: deleted ? command.now : null,
            status: nextStatus,
            statusChangedAt: command.now,
            statusReasonPublic: publicReason,
          statusReasonInternal: internalReason,
          mustChangePassword: deleted && target.role === "ADMIN"
            ? true
            : target.mustChangePassword,
            authVersion: sql`${userAccounts.authVersion} + 1`,
            revision: sql`${userAccounts.revision} + 1`,
            updatedAt: command.now,
          })
          .where(and(eq(userAccounts.id, target.id), eq(userAccounts.revision, expectedRevision)))
          .returning()
      )[0];
      if (!updated) {
        throw new Error("Locked deleted-state target could not be updated.");
      }
      let removedTotpCredentialCount = 0;
      if (deleted && target.role === "ADMIN") {
        const removed = await transaction
          .delete(adminTotpCredentials)
          .where(eq(adminTotpCredentials.userAccountId, target.id))
          .returning({ userAccountId: adminTotpCredentials.userAccountId });
        removedTotpCredentialCount = removed.length;
      }
      const revoked = await revokeAllSessions(transaction, target.id, command.now);
      const action = deleted ? "ACCOUNT_SOFT_DELETED" : "ACCOUNT_RESTORED";
      await insertStatusHistory(transaction, {
        actorId: actor.id,
        userAccountId: target.id,
        action,
        previousStatus: target.status,
        nextStatus,
        publicReason,
        internalReason,
        now: command.now,
      });
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: actor.id,
        action,
        targetType: "USER_ACCOUNT",
        targetId: target.id,
        beforeJson: auditAccountSnapshot(target),
        afterJson: auditAccountSnapshot(updated),
        metadataJson: {
          playerLinkPreserved: true,
          pendingPlayerClaimReleased: releasedClaimCount > 0,
          releasedClaimCount,
          cancelledPasswordResetCount,
          safeClaimReopenedOnRestore: restoredClaimReopened,
          adminSecurityReset: deleted && target.role === "ADMIN",
          removedTotpCredentialCount,
          revokedSessionCount: revoked.length,
          reasonRecorded: true,
        },
        createdAt: command.now,
      });
      const dto = await accountDto(transaction, target.id, true);
      if (!dto) throw new Error("Deleted-state account could not be reloaded.");
      const outcome: Extract<AccountMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: {
          message: deleted
            ? "계정이 소프트 삭제되었습니다. 플레이어 연결 기록은 보존하고 검토 대기 claim은 해제했습니다."
            : restoredClaimReopened
              ? "계정이 복구되었고 선점 여부를 재검사한 player claim이 승인 대기로 다시 열렸습니다."
              : "계정이 복구되어 승인 대기 상태가 되었습니다.",
          account: dto,
        },
        revision: updated.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }
}
