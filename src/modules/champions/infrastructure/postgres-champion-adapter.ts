import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { championCatalog, championCommandReceipts, championOutbox } from "@/platform/db/schema/catalog";
import type { V2Database } from "@/platform/db/database";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import { ChampionApplicationError, type ChampionCommandHandlerDependencies } from "../application/command-handler";
import type { ChampionCommand } from "../application/commands";
import type { ChampionReceipt, ChampionReceiptClaim, ChampionTransaction } from "../application/ports";
import type { Champion } from "../domain/champion";

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1_000;

function mapChampion(row: typeof championCatalog.$inferSelect): Champion {
  return Object.freeze({
    key: row.key,
    displayName: row.displayName,
    status: row.status,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function receiptBody(value: Record<string, unknown>): ChampionReceipt["body"] | null {
  if (
    typeof value.key !== "string" ||
    typeof value.displayName !== "string" ||
    (value.status !== "ACTIVE" && value.status !== "INACTIVE") ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) return null;
  return { key: value.key, displayName: value.displayName, status: value.status, revision: value.revision };
}

export class PostgresChampionAdapter {
  private readonly transactions = new WeakMap<object, { transaction: V2Transaction; actorUserAccountId: string | null }>();

  constructor(private readonly database: V2Database) {}

  dependencies(): ChampionCommandHandlerDependencies {
    return {
      unitOfWork: { transaction: (operation) => withTransaction(this.database, async (transaction) => {
        const context = {} as ChampionTransaction;
        this.transactions.set(context as object, { transaction, actorUserAccountId: null });
        try { return await operation(context); }
        finally { this.transactions.delete(context as object); }
      }) },
      authorization: { recheck: (transaction, command) => this.recheck(transaction, command) },
      repository: {
        loadForUpdate: (transaction, key) => this.loadForUpdate(transaction, key),
        insert: (transaction, champion) => this.insert(transaction, champion),
        save: (transaction, champion, expectedRevision) => this.save(transaction, champion, expectedRevision),
      },
      receipts: {
        claim: (transaction, command) => this.claim(transaction, command),
        complete: (transaction, receipt) => this.complete(transaction, receipt),
      },
      audit: { append: async (transaction, event) => {
        await this.tx(transaction).insert(auditEvents).values({
          requestId: event.requestId,
          actorUserAccountId: event.actorUserAccountId,
          action: event.action,
          targetType: "CHAMPION",
          targetId: event.championKey,
          beforeJson: event.before,
          afterJson: event.after,
          createdAt: new Date(event.occurredAt),
        });
      } },
      outbox: { append: async (transaction, event) => {
        await this.tx(transaction).insert(championOutbox).values({
          id: randomUUID(),
          requestId: event.requestId,
          championKey: event.championKey,
          aggregateRevision: event.revision,
          eventType: event.eventType,
          dedupeKey: event.dedupeKey,
          payloadJson: event.payload,
          createdAt: new Date(event.occurredAt),
        });
      } },
      clock: {
        now: () => new Date(),
        receiptExpiresAt: (now) => new Date(now.getTime() + RECEIPT_TTL_MS),
      },
    };
  }

  private tx(context: ChampionTransaction) {
    const transaction = this.transactions.get(context as object);
    if (!transaction) throw new Error("CHAMPION_TRANSACTION_NOT_ACTIVE");
    return transaction.transaction;
  }

  private async recheck(transaction: ChampionTransaction, command: ChampionCommand) {
    const actor = await lockTransactionSessionActor(
      this.tx(transaction),
      command.metadata.actorSession,
      new Date(),
      ADMIN_MUTATION_SESSION_POLICY,
    );
    if (!actor || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) return null;
    const state = this.transactions.get(transaction as object);
    if (!state) throw new Error("CHAMPION_TRANSACTION_NOT_ACTIVE");
    state.actorUserAccountId = actor.id;
    return { principalId: command.metadata.actorSession.sessionId, userAccountId: actor.id, role: actor.role } as const;
  }

  private async loadForUpdate(transaction: ChampionTransaction, key: string) {
    const executor = this.tx(transaction);
    await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`champion:${key}`}, 0))`);
    const row = (await executor.select().from(championCatalog).where(eq(championCatalog.key, key)).for("update").limit(1))[0];
    return row ? mapChampion(row) : null;
  }

  private async insert(transaction: ChampionTransaction, champion: Champion) {
    await this.tx(transaction).insert(championCatalog).values({
      key: champion.key,
      displayName: champion.displayName,
      status: champion.status,
      revision: champion.revision,
      createdAt: champion.createdAt,
      updatedAt: champion.updatedAt,
    });
  }

  private async save(transaction: ChampionTransaction, champion: Champion, expectedRevision: number) {
    const updated = await this.tx(transaction).update(championCatalog).set({
      displayName: champion.displayName,
      status: champion.status,
      revision: champion.revision,
      updatedAt: champion.updatedAt,
    }).where(and(eq(championCatalog.key, champion.key), eq(championCatalog.revision, expectedRevision))).returning({ revision: championCatalog.revision });
    if (updated.length !== 1) throw new ChampionApplicationError("PRECONDITION_FAILED", "Champion revision changed.");
  }

  private async claim(transaction: ChampionTransaction, command: ChampionCommand): Promise<ChampionReceiptClaim> {
    const executor = this.tx(transaction);
    const { actorSession, idempotency } = command.metadata;
    const lockKey = `${actorSession.userAccountId}:${idempotency.scope}:${Buffer.from(idempotency.keyHash).toString("hex")}`;
    await executor.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    await executor.delete(championCommandReceipts).where(and(
      eq(championCommandReceipts.actorUserAccountId, actorSession.userAccountId),
      eq(championCommandReceipts.scope, idempotency.scope),
      eq(championCommandReceipts.keyHash, Buffer.from(idempotency.keyHash)),
      sql<boolean>`${championCommandReceipts.expiresAt} <= clock_timestamp()`,
    ));
    const row = (await executor.select().from(championCommandReceipts).where(and(
      eq(championCommandReceipts.actorUserAccountId, actorSession.userAccountId),
      eq(championCommandReceipts.scope, idempotency.scope),
      eq(championCommandReceipts.keyHash, Buffer.from(idempotency.keyHash)),
    )).limit(1))[0];
    if (row) {
      if (!Buffer.from(row.requestHash).equals(Buffer.from(idempotency.requestHash)) || row.bodyDigestHex !== idempotency.bodyDigestHex) {
        return { kind: "MISMATCH" as const };
      }
      const body = receiptBody(row.responseJson);
      if (!body || (row.responseStatus !== 200 && row.responseStatus !== 201)) {
        return { kind: "MISMATCH" as const };
      }
      return { kind: "REPLAY" as const, receipt: {
        actorPrincipalId: actorSession.sessionId,
        scope: row.scope,
        keyHash: row.keyHash,
        requestHash: row.requestHash,
        bodyDigestHex: row.bodyDigestHex,
        body,
        responseStatus: row.responseStatus as 200 | 201,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      } };
    }
    await executor.insert(championCommandReceipts).values({
      id: randomUUID(),
      actorUserAccountId: actorSession.userAccountId,
      scope: idempotency.scope,
      keyHash: Buffer.from(idempotency.keyHash),
      requestHash: Buffer.from(idempotency.requestHash),
      bodyDigestHex: idempotency.bodyDigestHex,
      responseStatus: 202,
      responseJson: { pending: true },
      expiresAt: new Date(Date.now() + RECEIPT_TTL_MS),
    });
    return { kind: "CLAIMED" as const };
  }

  private async complete(transaction: ChampionTransaction, receipt: ChampionReceipt) {
    const state = this.transactions.get(transaction as object);
    if (!state?.actorUserAccountId) throw new Error("CHAMPION_RECEIPT_ACTOR_BINDING_REQUIRED");
    const updated = await this.tx(transaction).update(championCommandReceipts).set({
      responseStatus: receipt.responseStatus,
      responseJson: receipt.body,
      createdAt: new Date(receipt.createdAt),
      expiresAt: new Date(receipt.expiresAt),
    }).where(and(
      eq(championCommandReceipts.actorUserAccountId, state.actorUserAccountId),
      eq(championCommandReceipts.scope, receipt.scope),
      eq(championCommandReceipts.keyHash, Buffer.from(receipt.keyHash)),
      eq(championCommandReceipts.requestHash, Buffer.from(receipt.requestHash)),
      eq(championCommandReceipts.bodyDigestHex, receipt.bodyDigestHex),
    )).returning({ id: championCommandReceipts.id });
    if (updated.length !== 1) throw new ChampionApplicationError("IDEMPOTENCY_MISMATCH", "Champion receipt claim was lost.");
  }
}
