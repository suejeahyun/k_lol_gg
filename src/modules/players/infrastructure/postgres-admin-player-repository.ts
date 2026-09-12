import { createHash, randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, like, or, sql } from "drizzle-orm";

import { auditEvents } from "@/platform/db/schema/audit";
import {
  ADMIN_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { userAccounts } from "@/platform/db/schema/auth";
import { playerMutationReceipts, players } from "@/platform/db/schema/registry";
import type { V2Database } from "@/platform/db/database";
import type { DatabaseExecutor, V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";
import { disconnectConnectedRiotIdentityForPlayer } from "@/modules/riot/infrastructure/postgres-riot-identity-change";

import type { AdminPlayerRepository } from "../application/ports/admin-player-repository";
import {
  normalizePlayerIdentity,
  playerMutationScope,
  type AdminPlayer,
  type AdminPlayerListQuery,
  type PlayerMutationCommand,
  type PlayerMutationOutcome,
  type PlayerMutationResponse,
  type PlayerWriteInput,
} from "../domain/admin-player";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const receiptLifetimeMs = 24 * 60 * 60 * 1_000;

const adminPlayerSelection = {
  id: players.id,
  legacyId: players.legacyId,
  memberName: players.memberName,
  nickname: players.nickname,
  tagLine: players.tagLine,
  peakTier: players.peakTier,
  currentTier: players.currentTier,
  status: players.status,
  revision: players.revision,
  deactivatedAt: players.deactivatedAt,
  accountLifecycleDeactivatedAt: players.accountLifecycleDeactivatedAt,
  createdAt: players.createdAt,
  updatedAt: players.updatedAt,
  accountId: userAccounts.id,
  accountLoginId: userAccounts.loginId,
  accountRole: userAccounts.role,
  accountStatus: userAccounts.status,
};

type AdminPlayerRow = {
  id: string;
  legacyId: number | null;
  memberName: string;
  nickname: string;
  tagLine: string;
  peakTier: string | null;
  currentTier: string | null;
  status: "ACTIVE" | "INACTIVE";
  revision: number;
  deactivatedAt: Date | null;
  accountLifecycleDeactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  accountId: string | null;
  accountLoginId: string | null;
  accountRole: "USER" | "ADMIN" | "SUPER_ADMIN" | null;
  accountStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" | null;
};

function escapeLikePrefix(value: string): string {
  return `${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function toAdminPlayer(row: AdminPlayerRow): AdminPlayer {
  return {
    id: row.id,
    legacyId: row.legacyId,
    memberName: row.memberName,
    nickname: row.nickname,
    tagLine: row.tagLine,
    riotId: `${row.nickname}#${row.tagLine}`,
    peakTier: row.peakTier,
    currentTier: row.currentTier,
    status: row.status,
    revision: row.revision,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    account:
      row.accountId && row.accountLoginId && row.accountRole && row.accountStatus
        ? {
            id: row.accountId,
            loginId: row.accountLoginId,
            role: row.accountRole,
            status: row.accountStatus,
          }
        : null,
  };
}

function playerValues(input: PlayerWriteInput) {
  return {
    legacyId: input.legacyId,
    memberName: input.memberName,
    memberNameNormalized: normalizePlayerIdentity(input.memberName),
    nickname: input.nickname,
    nicknameNormalized: normalizePlayerIdentity(input.nickname),
    tagLine: input.tagLine,
    tagLineNormalized: normalizePlayerIdentity(input.tagLine),
    peakTier: input.peakTier,
    currentTier: input.currentTier,
  };
}

function auditSnapshot(player: AdminPlayer) {
  return {
    id: player.id,
    legacyId: player.legacyId,
    memberName: player.memberName,
    nickname: player.nickname,
    tagLine: player.tagLine,
    peakTier: player.peakTier,
    currentTier: player.currentTier,
    status: player.status,
    revision: player.revision,
    deactivatedAt: player.deactivatedAt,
  };
}

function digest(value: Uint8Array | string): Buffer {
  return createHash("sha256").update(value).digest();
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

async function findAdminPlayerRow(
  database: DatabaseExecutor,
  id: string,
): Promise<AdminPlayerRow | null> {
  const rows = await database
    .select(adminPlayerSelection)
    .from(players)
    .leftJoin(userAccounts, eq(players.userAccountId, userAccounts.id))
    .where(eq(players.id, id))
    .limit(1);
  return (rows[0] as AdminPlayerRow | undefined) ?? null;
}

type ReceiptIdentity = Readonly<{
  keyHash: Buffer;
  requestHash: Buffer;
  scope: string;
}>;

function receiptIdentity(
  command: PlayerMutationCommand,
  scope: string,
): ReceiptIdentity {
  return {
    keyHash: digest(command.idempotencyKeyMaterial),
    requestHash: digest(command.requestFingerprint),
    scope,
  };
}

async function lockReceipt(transaction: V2Transaction, identity: ReceiptIdentity) {
  const lockKey = identity.keyHash.toString("hex");
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
}

async function replayReceipt(
  transaction: V2Transaction,
  command: PlayerMutationCommand,
  identity: ReceiptIdentity,
): Promise<PlayerMutationOutcome | null> {
  const conditions = and(
    eq(playerMutationReceipts.actorUserAccountId, command.actorUserAccountId),
    eq(playerMutationReceipts.scope, identity.scope),
    eq(playerMutationReceipts.keyHash, identity.keyHash),
  );
  const rows = await transaction
    .select()
    .from(playerMutationReceipts)
    .where(
      and(
        conditions,
        sql<boolean>`${playerMutationReceipts.expiresAt} > clock_timestamp()`,
      ),
    )
    .limit(1);
  const receipt = rows[0];
  if (!receipt) {
    await transaction
      .delete(playerMutationReceipts)
      .where(
        and(
          conditions,
          sql<boolean>`${playerMutationReceipts.expiresAt} <= clock_timestamp()`,
        ),
      );
    return null;
  }
  if (!Buffer.from(receipt.requestHash).equals(identity.requestHash)) {
    return { type: "conflict", reason: "IDEMPOTENCY_KEY_REUSED" };
  }

  const response = receipt.responseJson as PlayerMutationResponse;
  return {
    type: "success",
    status: receipt.responseStatus === 201 ? 201 : 200,
    response,
    revision: response.player.revision,
    replayed: true,
  };
}

async function saveReceipt(
  transaction: V2Transaction,
  command: PlayerMutationCommand,
  identity: ReceiptIdentity,
  outcome: Extract<PlayerMutationOutcome, { type: "success" }>,
) {
  await transaction.insert(playerMutationReceipts).values({
    actorUserAccountId: command.actorUserAccountId,
    scope: identity.scope,
    keyHash: identity.keyHash,
    requestHash: identity.requestHash,
    responseStatus: outcome.status,
    responseJson: outcome.response,
    responseEtag: `"${outcome.revision}"`,
    createdAt: sql`clock_timestamp()`,
    expiresAt: sql`clock_timestamp() + (${receiptLifetimeMs} * interval '1 millisecond')`,
  });
}

async function startMutation(
  transaction: V2Transaction,
  command: PlayerMutationCommand,
  scope: string,
) {
  const identity = receiptIdentity(command, scope);
  await lockReceipt(transaction, identity);
  return {
    identity,
    replay: await replayReceipt(transaction, command, identity),
  };
}

async function authorizeMutation(
  transaction: V2Transaction,
  command: PlayerMutationCommand,
): Promise<boolean> {
  if (command.actorUserAccountId !== command.actorSession.userAccountId) return false;
  return Boolean(
    await lockTransactionSessionActor(
      transaction,
      command.actorSession,
      command.now,
      ADMIN_MUTATION_SESSION_POLICY,
    ),
  );
}

export class PostgresAdminPlayerRepository implements AdminPlayerRepository {
  constructor(private readonly database: V2Database) {}

  async list(query: AdminPlayerListQuery) {
    const predicates = [];
    if (query.status !== "ALL") predicates.push(eq(players.status, query.status));

    const normalized = normalizePlayerIdentity(query.query);
    if (normalized) {
      const prefix = escapeLikePrefix(normalized);
      const riotId = sql<string>`${players.nicknameNormalized} || '#' || ${players.tagLineNormalized}`;
      const legacyId = /^[1-9][0-9]{0,9}$/.test(normalized) ? Number(normalized) : null;
      predicates.push(
        or(
          like(players.memberNameNormalized, prefix),
          like(players.nicknameNormalized, prefix),
          like(riotId, prefix),
          ...(legacyId && legacyId <= 2_147_483_647 ? [eq(players.legacyId, legacyId)] : []),
        )!,
      );
    }
    const predicate = predicates.length ? and(...predicates) : undefined;

    const totalRows = await this.database.select({ value: count() }).from(players).where(predicate);
    const totalCount = totalRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / query.pageSize));
    const currentPage = Math.min(query.page, totalPages);
    const rows = await this.database
      .select(adminPlayerSelection)
      .from(players)
      .leftJoin(userAccounts, eq(players.userAccountId, userAccounts.id))
      .where(predicate)
      .orderBy(desc(players.updatedAt), asc(players.nicknameNormalized))
      .limit(query.pageSize)
      .offset((currentPage - 1) * query.pageSize);

    return {
      items: (rows as AdminPlayerRow[]).map(toAdminPlayer),
      totalCount,
      currentPage,
      totalPages,
      pageSize: query.pageSize,
    };
  }

  async findById(id: string): Promise<AdminPlayer | null> {
    if (!uuidPattern.test(id)) return null;
    const row = await findAdminPlayerRow(this.database, id);
    return row ? toAdminPlayer(row) : null;
  }

  async create(
    input: PlayerWriteInput,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome> {
    try {
      return await withTransaction(this.database, async (transaction) => {
        if (!(await authorizeMutation(transaction, command))) return { type: "session-stale" };
        const started = await startMutation(transaction, command, playerMutationScope("create"));
        if (started.replay) return started.replay;

        const id = randomUUID();
        await transaction.insert(players).values({ id, ...playerValues(input) });
        const row = await findAdminPlayerRow(transaction, id);
        if (!row) throw new Error("Created player could not be reloaded.");
        const player = toAdminPlayer(row);
        await transaction.insert(auditEvents).values({
          requestId: command.requestId,
          actorUserAccountId: command.actorUserAccountId,
          action: "PLAYER_CREATED",
          targetType: "PLAYER",
          targetId: id,
          afterJson: auditSnapshot(player),
        });
        const outcome: Extract<PlayerMutationOutcome, { type: "success" }> = {
          type: "success",
          status: 201,
          response: { message: "플레이어가 등록되었습니다.", player },
          revision: player.revision,
          replayed: false,
        };
        await saveReceipt(transaction, command, started.identity, outcome);
        return outcome;
      });
    } catch (error) {
      const constraint = errorConstraint(error);
      if (constraint === "players_nickname_tag_line_normalized_uidx") {
        return { type: "conflict", reason: "DUPLICATE_RIOT_ID" };
      }
      if (constraint === "players_legacy_id_uidx") {
        return { type: "conflict", reason: "DUPLICATE_LEGACY_ID" };
      }
      throw error;
    }
  }

  async update(
    id: string,
    input: PlayerWriteInput,
    expectedRevision: number,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome> {
    if (!uuidPattern.test(id)) return { type: "not-found" };
    try {
      return await withTransaction(this.database, async (transaction) => {
        if (!(await authorizeMutation(transaction, command))) return { type: "session-stale" };
        const started = await startMutation(
          transaction,
          command,
          playerMutationScope("update", id),
        );
        if (started.replay) return started.replay;

        const beforeRow = await findAdminPlayerRow(transaction, id);
        if (!beforeRow) return { type: "not-found" };
        if (beforeRow.revision !== expectedRevision) {
          return { type: "precondition-failed", currentRevision: beforeRow.revision };
        }
        const riotIdentityChanged =
          normalizePlayerIdentity(beforeRow.nickname) !== normalizePlayerIdentity(input.nickname) ||
          normalizePlayerIdentity(beforeRow.tagLine) !== normalizePlayerIdentity(input.tagLine);

        const updated = await transaction
          .update(players)
          .set({
            ...playerValues(input),
            revision: sql`${players.revision} + 1`,
            updatedAt: command.now,
          })
          .where(and(eq(players.id, id), eq(players.revision, expectedRevision)))
          .returning({ id: players.id });
        if (updated.length !== 1) {
          const current = await findAdminPlayerRow(transaction, id);
          return current
            ? { type: "precondition-failed", currentRevision: current.revision }
            : { type: "not-found" };
        }

        const riotIdentityChange = riotIdentityChanged
          ? await disconnectConnectedRiotIdentityForPlayer(transaction, {
              playerId: id,
              nextGameName: input.nickname,
              nextTagLine: input.tagLine,
              actorUserAccountId: command.actorUserAccountId,
              requestId: command.requestId,
              now: command.now,
              source: "ADMIN_PROFILE",
            })
          : { disconnected: false, previousRiotId: undefined };

        const afterRow = await findAdminPlayerRow(transaction, id);
        if (!afterRow) throw new Error("Updated player could not be reloaded.");
        const before = toAdminPlayer(beforeRow);
        const player = toAdminPlayer(afterRow);
        await transaction.insert(auditEvents).values({
          requestId: command.requestId,
          actorUserAccountId: command.actorUserAccountId,
          action: "PLAYER_UPDATED",
          targetType: "PLAYER",
          targetId: id,
          beforeJson: auditSnapshot(before),
          afterJson: auditSnapshot(player),
          metadataJson: riotIdentityChanged
            ? {
                riotIdentityChanged: true,
                linkedRiotAccountDisconnected: riotIdentityChange.disconnected,
                previousLinkedRiotId: riotIdentityChange.previousRiotId ?? null,
              }
            : undefined,
        });
        const outcome: Extract<PlayerMutationOutcome, { type: "success" }> = {
          type: "success",
          status: 200,
          response: {
            message: riotIdentityChange.disconnected
              ? "플레이어 정보가 수정되었습니다. 기존 Riot 연동을 해제했습니다. Riot 탭에서 새 ID로 다시 연결해 주세요."
              : "플레이어 정보가 수정되었습니다.",
            player,
          },
          revision: player.revision,
          replayed: false,
        };
        await saveReceipt(transaction, command, started.identity, outcome);
        return outcome;
      });
    } catch (error) {
      const constraint = errorConstraint(error);
      if (constraint === "players_nickname_tag_line_normalized_uidx") {
        return { type: "conflict", reason: "DUPLICATE_RIOT_ID" };
      }
      if (constraint === "players_legacy_id_uidx") {
        return { type: "conflict", reason: "DUPLICATE_LEGACY_ID" };
      }
      throw error;
    }
  }

  async deactivate(
    id: string,
    expectedRevision: number,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome> {
    if (!uuidPattern.test(id)) return { type: "not-found" };
    return withTransaction(this.database, async (transaction) => {
      if (!(await authorizeMutation(transaction, command))) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        playerMutationScope("deactivate", id),
      );
      if (started.replay) return started.replay;

      const beforeRow = await findAdminPlayerRow(transaction, id);
      if (!beforeRow) return { type: "not-found" };
      if (beforeRow.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: beforeRow.revision };
      }

      if (beforeRow.status === "INACTIVE") {
        const player = toAdminPlayer(beforeRow);
        const outcome: Extract<PlayerMutationOutcome, { type: "success" }> = {
          type: "success",
          status: 200,
          response: { message: "이미 비활성화된 플레이어입니다.", player },
          revision: player.revision,
          replayed: false,
        };
        await saveReceipt(transaction, command, started.identity, outcome);
        return outcome;
      }

      const updated = await transaction
        .update(players)
        .set({
          status: "INACTIVE",
          deactivatedAt: command.now,
          revision: sql`${players.revision} + 1`,
          updatedAt: command.now,
        })
        .where(and(eq(players.id, id), eq(players.revision, expectedRevision)))
        .returning({ id: players.id });
      if (updated.length !== 1) {
        const current = await findAdminPlayerRow(transaction, id);
        return current
          ? { type: "precondition-failed", currentRevision: current.revision }
          : { type: "not-found" };
      }

      const afterRow = await findAdminPlayerRow(transaction, id);
      if (!afterRow) throw new Error("Deactivated player could not be reloaded.");
      const before = toAdminPlayer(beforeRow);
      const player = toAdminPlayer(afterRow);
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: command.actorUserAccountId,
        action: "PLAYER_DEACTIVATED",
        targetType: "PLAYER",
        targetId: id,
        beforeJson: auditSnapshot(before),
        afterJson: auditSnapshot(player),
        metadataJson: { preservation: "SOFT_DEACTIVATION" },
      });
      const outcome: Extract<PlayerMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: {
          message: "플레이어가 비활성화되었습니다. 기존 경기와 통계 식별자는 보존됩니다.",
          player,
        },
        revision: player.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }

  async reactivate(
    id: string,
    expectedRevision: number,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome> {
    if (!uuidPattern.test(id)) return { type: "not-found" };
    return withTransaction(this.database, async (transaction) => {
      if (!(await authorizeMutation(transaction, command))) return { type: "session-stale" };
      const started = await startMutation(
        transaction,
        command,
        playerMutationScope("reactivate", id),
      );
      if (started.replay) return started.replay;

      const beforeRow = await findAdminPlayerRow(transaction, id);
      if (!beforeRow) return { type: "not-found" };
      if (beforeRow.revision !== expectedRevision) {
        return { type: "precondition-failed", currentRevision: beforeRow.revision };
      }

      if (beforeRow.status === "ACTIVE") {
        const player = toAdminPlayer(beforeRow);
        const outcome: Extract<PlayerMutationOutcome, { type: "success" }> = {
          type: "success",
          status: 200,
          response: { message: "이미 활성 상태인 플레이어입니다.", player },
          revision: player.revision,
          replayed: false,
        };
        await saveReceipt(transaction, command, started.identity, outcome);
        return outcome;
      }
      if (beforeRow.accountLifecycleDeactivatedAt !== null) {
        return { type: "conflict", reason: "ACCOUNT_LIFECYCLE_MANAGED" };
      }

      const updated = await transaction
        .update(players)
        .set({
          status: "ACTIVE",
          deactivatedAt: null,
          accountLifecycleDeactivatedAt: null,
          revision: sql`${players.revision} + 1`,
          updatedAt: command.now,
        })
        .where(and(eq(players.id, id), eq(players.revision, expectedRevision)))
        .returning({ id: players.id });
      if (updated.length !== 1) {
        const current = await findAdminPlayerRow(transaction, id);
        return current
          ? { type: "precondition-failed", currentRevision: current.revision }
          : { type: "not-found" };
      }

      const afterRow = await findAdminPlayerRow(transaction, id);
      if (!afterRow) throw new Error("Reactivated player could not be reloaded.");
      const before = toAdminPlayer(beforeRow);
      const player = toAdminPlayer(afterRow);
      await transaction.insert(auditEvents).values({
        requestId: command.requestId,
        actorUserAccountId: command.actorUserAccountId,
        action: "PLAYER_REACTIVATED",
        targetType: "PLAYER",
        targetId: id,
        beforeJson: auditSnapshot(before),
        afterJson: auditSnapshot(player),
        metadataJson: { restoration: "EXPLICIT_ADMIN_REACTIVATION" },
      });
      const outcome: Extract<PlayerMutationOutcome, { type: "success" }> = {
        type: "success",
        status: 200,
        response: {
          message: "플레이어가 재활성화되었습니다. 공개 검색과 기존 번호 주소가 다시 연결됩니다.",
          player,
        },
        revision: player.revision,
        replayed: false,
      };
      await saveReceipt(transaction, command, started.identity, outcome);
      return outcome;
    });
  }
}
