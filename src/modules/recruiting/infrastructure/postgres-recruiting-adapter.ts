import { createHash, randomUUID } from "node:crypto";

import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import {
  ADMIN_MUTATION_SESSION_POLICY,
  APPROVED_ACCOUNT_MUTATION_SESSION_POLICY,
  lockTransactionSessionActor,
} from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { userAccounts } from "@/platform/db/schema/auth";
import { destructionCompetitions } from "@/platform/db/schema/destruction-competitions";
import {
  recruitParties,
  kakaoRoomMembers,
  kakaoRooms,
  kakaoImageSessions,
  recruitingCommandReceipts,
  recruitingNonceBindings,
  recruitingOutbox,
  scrimRecruits,
} from "@/platform/db/schema/recruiting";
import { seasonKakaoPendingApplications } from "@/platform/db/schema/seasons";
import type { V2Database } from "@/platform/db/database";
import type { V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import { RecruitingApplicationError } from "../application/command-handler";
import { kakaoRecruitCommandAccess, type RecruitingCommand, type RecruitingCommandActor } from "../application/commands";
import { kakaoRoleAtLeast, type KakaoRoomMemberRole } from "../kakao-access/domain";
import type {
  AdminRecruitingStatusDto,
  RecruitCommandReceipt,
  RecruitingAuditEvent,
  RecruitingAuthorizationPort,
  RecruitingCompatTargetInput,
  RecruitingOutboxEvent,
  RecruitingQueryPort,
  RecruitingReceiptPort,
  RecruitingRepository,
  RecruitingTransactionContext,
  RecruitingUnitOfWork,
} from "../application/ports";
import { toPublicPartyDto, toPublicScrimDto } from "../application/public-dto";
import { kakaoRoomOwnsRecruitAggregate, kakaoSenderControlsRecruitAggregate } from "../domain/recruiting";
import type { RecruitMember, RecruitParty, ScrimLineup, ScrimRecruit } from "../domain/recruiting";

const RECEIPT_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const NONCE_TTL_MILLISECONDS = 15 * 60 * 1_000;
const ACTIVE_DESTRUCTION_STATUSES = ["PLANNED", "RECRUITING", "TEAM_BUILDING", "AUCTION", "PRELIMINARY", "TOURNAMENT"] as const;

type TransactionActor = Readonly<{
  actor: RecruitingCommandActor;
  commandType: RecruitingCommand["type"];
}>;

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function sameBytes(left: Buffer | Uint8Array, right: Buffer | Uint8Array) {
  return Buffer.from(left).equals(Buffer.from(right));
}

function validMember(value: unknown): value is RecruitMember {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<RecruitMember>;
  return typeof item.name === "string" &&
    Number.isSafeInteger(item.slotNo) &&
    typeof item.substitute === "boolean" &&
    (item.position === null || ["TOP", "JGL", "MID", "ADC", "SUP"].includes(String(item.position)));
}

function validLineup(value: unknown): value is ScrimLineup | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  if (keys.join("|") !== "adc|jungle|mid|support|top") return false;
  return keys.every((key) => item[key] === null || typeof item[key] === "string");
}

function partyFromRow(row: typeof recruitParties.$inferSelect): RecruitParty {
  if (!Array.isArray(row.membersJson) || !row.membersJson.every(validMember)) {
    throw new Error("Stored recruit party members are invalid.");
  }
  return {
    id: row.id,
    revision: row.revision,
    sourceRoomId: row.sourceRoomId,
    sourceSenderId: row.sourceSenderId,
    recruitDate: row.recruitDate,
    resetSequence: row.resetSequence,
    recruitNumber: row.recruitNumber,
    type: row.type,
    status: row.status,
    title: row.title,
    maximumMembers: row.maximumMembers,
    members: row.membersJson,
    startTimeText: row.startTimeText,
    gameInfo: row.gameInfo,
    scheduledStartAt: row.scheduledStartAt,
    protectedUntil: row.protectedUntil,
    lastActivityAt: row.lastActivityAt,
  };
}

function scrimFromRow(row: typeof scrimRecruits.$inferSelect): ScrimRecruit {
  if (!validLineup(row.requesterLineupJson) || !validLineup(row.opponentLineupJson)) {
    throw new Error("Stored scrim lineups are invalid.");
  }
  return {
    id: row.id,
    revision: row.revision,
    sourceRoomId: row.sourceRoomId,
    sourceSenderId: row.sourceSenderId,
    opponentSenderId: row.opponentSenderId,
    recruitDate: row.recruitDate,
    scrimNumber: row.scrimNumber,
    tournamentId: row.tournamentId,
    legacyTournamentNumber: row.legacyTournamentNumber,
    requesterTeamId: row.requesterTeamId,
    opponentTeamId: row.opponentTeamId,
    legacyTitle: row.legacyTitle,
    requesterTeamName: row.requesterTeamName,
    opponentTeamName: row.opponentTeamName,
    requesterLineup: row.requesterLineupJson,
    opponentLineup: row.opponentLineupJson,
    legacyMemo: row.legacyMemo,
    legacySeriesRuleText: row.legacySeriesRuleText,
    status: row.status,
    scheduledAt: row.scheduledAt,
    bestOf: row.bestOf,
  };
}

function receiptFromRow(row: typeof recruitingCommandReceipts.$inferSelect): RecruitCommandReceipt | null {
  if (row.responseStatus !== 200 && row.responseStatus !== 201) return null;
  if (!row.responseJson || row.responseRevision === null) return null;
  return {
    actorPrincipalId: row.actorPrincipalId,
    scope: row.scope,
    keyHash: row.keyHash,
    requestHash: row.requestHash,
    bodyDigestHex: row.bodyDigestHex,
    responseStatus: row.responseStatus,
    body: row.responseJson as RecruitCommandReceipt["body"],
    revision: row.responseRevision,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function ownedAggregate(commandType: RecruitingCommand["type"]) {
  return commandType.includes("SCRIM") ? "SCRIM" as const : "PARTY" as const;
}

export class PostgresRecruitingAdapter implements
  RecruitingUnitOfWork,
  RecruitingRepository,
  RecruitingAuthorizationPort,
  RecruitingReceiptPort,
  RecruitingQueryPort {
  private readonly transactions = new WeakMap<RecruitingTransactionContext, V2Transaction>();
  private readonly actors = new WeakMap<RecruitingTransactionContext, TransactionActor>();

  constructor(private readonly database: V2Database) {}

  async resolveCompatTarget(input: RecruitingCompatTargetInput) {
    if (input.kind === "PARTY") {
      if (input.allowedPartyStatuses?.length === 0) return null;
      return (await this.database.select({ id: recruitParties.id, revision: recruitParties.revision })
        .from(recruitParties).where(and(
          eq(recruitParties.sourceRoomId, input.sourceRoomId),
          eq(recruitParties.recruitDate, input.recruitDate),
          eq(recruitParties.recruitNumber, input.recruitNumber),
          input.allowedPartyStatuses ? inArray(recruitParties.status, input.allowedPartyStatuses) : undefined,
        )).orderBy(desc(recruitParties.resetSequence)).limit(1))[0] ?? null;
    }
    return (await this.database.select({ id: scrimRecruits.id, revision: scrimRecruits.revision })
      .from(scrimRecruits).where(and(
        eq(scrimRecruits.sourceRoomId, input.sourceRoomId),
        eq(scrimRecruits.recruitDate, input.recruitDate),
        eq(scrimRecruits.scrimNumber, input.recruitNumber),
      )).limit(1))[0] ?? null;
  }

  async resolveScrimUpsert(input: Readonly<{
    sourceRoomId: string;
    recruitDate: string;
    requestedScrimNumber: number | null;
  }>) {
    const scrimNumber = input.requestedScrimNumber;
    if (scrimNumber === null) return null;
    if (scrimNumber < 1 || scrimNumber > 99) return null;
    const row = (await this.database.select().from(scrimRecruits).where(and(
      eq(scrimRecruits.sourceRoomId, input.sourceRoomId),
      eq(scrimRecruits.recruitDate, input.recruitDate),
      eq(scrimRecruits.scrimNumber, scrimNumber),
      inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"]),
    )).limit(1))[0];
    const existing = row ? toPublicScrimDto(scrimFromRow(row)) : null;
    return Object.freeze({
      scrimNumber,
      existing: existing ? Object.freeze({
        ...existing,
        revision: row!.revision,
        status: existing.status as "RECRUITING" | "MATCHED" | "CONFIRMED",
        bestOf: existing.bestOf ?? 3,
      }) : null,
    });
  }

  private transactionFor(context: RecruitingTransactionContext) {
    const transaction = this.transactions.get(context);
    if (!transaction) throw new Error("Recruiting transaction context is no longer active.");
    return transaction;
  }

  async transaction<T>(operation: (transaction: RecruitingTransactionContext) => Promise<T>): Promise<T> {
    return withTransaction(this.database, async (databaseTransaction) => {
      const context = {} as RecruitingTransactionContext;
      this.transactions.set(context, databaseTransaction);
      try {
        return await operation(context);
      } finally {
        this.actors.delete(context);
        this.transactions.delete(context);
      }
    });
  }

  async recheck(context: RecruitingTransactionContext, input: Readonly<{
    actor: RecruitingCommandActor;
    commandType: RecruitingCommand["type"];
    aggregateId: string;
    idempotency: RecruitingCommand["metadata"]["idempotency"];
  }>) {
    const transaction = this.transactionFor(context);
    const { actor } = input;
    this.actors.set(context, { actor, commandType: input.commandType });
    if (actor.kind === "ACCOUNT" || actor.kind === "ADMIN") {
      const policy = actor.kind === "ADMIN" ? ADMIN_MUTATION_SESSION_POLICY : APPROVED_ACCOUNT_MUTATION_SESSION_POLICY;
      const account = await lockTransactionSessionActor(transaction, actor.sessionActor, new Date(), policy);
      if (!account || account.id !== actor.principalId) {
        throw new RecruitingApplicationError("SESSION_STALE", "The account session changed before the recruiting mutation.");
      }
      if (actor.kind === "ADMIN" && actor.authorizationIntent.minimumRole === "SUPER_ADMIN" && account.role !== "SUPER_ADMIN") {
        throw new RecruitingApplicationError("FORBIDDEN", "This recruiting command requires SUPER_ADMIN.");
      }
      if (actor.kind === "ACCOUNT" && !input.commandType.startsWith("CREATE_")) {
        const aggregate = ownedAggregate(input.commandType);
        const owner = aggregate === "PARTY"
          ? (await transaction.select({ id: recruitParties.ownerUserAccountId }).from(recruitParties).where(eq(recruitParties.id, input.aggregateId)).limit(1))[0]?.id
          : (await transaction.select({ id: scrimRecruits.ownerUserAccountId }).from(scrimRecruits).where(eq(scrimRecruits.id, input.aggregateId)).limit(1))[0]?.id;
        if (owner !== account.id) throw new RecruitingApplicationError("NOT_FOUND", "The recruiting aggregate was not found.");
      }
      return;
    }

    if (actor.kind === "BOT" && !input.commandType.startsWith("CREATE_")) {
      const aggregate = ownedAggregate(input.commandType);
      const ownership = aggregate === "PARTY"
        ? (await transaction.select({ sourceRoomId: recruitParties.sourceRoomId, sourceSenderId: recruitParties.sourceSenderId }).from(recruitParties).where(eq(recruitParties.id, input.aggregateId)).limit(1))[0]
        : (await transaction.select({ sourceRoomId: scrimRecruits.sourceRoomId, sourceSenderId: scrimRecruits.sourceSenderId, opponentSenderId: scrimRecruits.opponentSenderId }).from(scrimRecruits).where(eq(scrimRecruits.id, input.aggregateId)).limit(1))[0];
      if (!kakaoRoomOwnsRecruitAggregate(ownership?.sourceRoomId ?? null, actor.authorizationIntent.roomId)) {
        throw new RecruitingApplicationError("NOT_FOUND", "The recruiting aggregate was not found in this Kakao room.");
      }
      const access = kakaoRecruitCommandAccess(input.commandType, actor.commandSource);
      if (access === "DENY") {
        throw new RecruitingApplicationError("FORBIDDEN", "This recruiting command is not available through Kakao.");
      }
      // COMPAT_V1 is the shared room workflow from the original Kakao bot: a
      // verified member may edit or close any aggregate in this canonical room.
      // The ownership lookup above is still mandatory for room isolation; the
      // webhook verifier already rechecked/registered the member in the room.
      if (access === "ROOM_MEMBER_MUTATION") {
        return this.claimSignedNonce(transaction, actor, input.idempotency);
      }
      const member = (await transaction.select({ role: kakaoRoomMembers.role, linkedUserAccountId: kakaoRoomMembers.linkedUserAccountId }).from(kakaoRoomMembers)
        .innerJoin(kakaoRooms, eq(kakaoRooms.id, kakaoRoomMembers.roomId)).where(and(
          eq(kakaoRooms.id, actor.authorizationIntent.roomId),
          eq(kakaoRooms.status, "ACTIVE"),
          eq(kakaoRoomMembers.senderFingerprint, actor.authorizationIntent.senderId),
        )).limit(1))[0];
      let role = (member?.role ?? "MEMBER") as KakaoRoomMemberRole;
      if (member?.linkedUserAccountId) {
        const account = (await transaction.select({ role: userAccounts.role, status: userAccounts.status }).from(userAccounts).where(eq(userAccounts.id, member.linkedUserAccountId)).limit(1))[0];
        if (account?.status === "APPROVED" && (account.role === "ADMIN" || account.role === "SUPER_ADMIN")) role = "ADMIN";
      }
      const controller = kakaoSenderControlsRecruitAggregate({
        sourceSenderId: ownership?.sourceSenderId ?? null,
        opponentSenderId: (ownership as { opponentSenderId?: string | null } | undefined)?.opponentSenderId ?? null,
        signedSenderId: actor.authorizationIntent.senderId,
        trustedSender: false,
      });
      if (access === "OWNER_OR_MANAGER" && !controller && !kakaoRoleAtLeast(role, "MANAGER")) {
        throw new RecruitingApplicationError("FORBIDDEN", "This Kakao lifecycle command requires the owner, room manager, or administrator role.");
      }
      if (access === "ADMIN" && !kakaoRoleAtLeast(role, "ADMIN")) {
        throw new RecruitingApplicationError("FORBIDDEN", "This Kakao lifecycle command requires the room administrator role.");
      }
    }

    await this.claimSignedNonce(transaction, actor, input.idempotency);
  }

  private async claimSignedNonce(
    transaction: ReturnType<PostgresRecruitingAdapter["transactionFor"]>,
    actor: Extract<RecruitingCommandActor, { kind: "BOT" | "JOB" }>,
    idempotency: RecruitingCommand["metadata"]["idempotency"],
  ) {
    const intent = actor.authorizationIntent;
    const nonce = intent.nonce;
    const keyId = actor.kind === "BOT" ? actor.authorizationIntent.keyId : actor.authorizationIntent.jobName;
    const nonceHash = sha256(`klol-v2:recruiting-nonce:v1\0${actor.principalId}\0${nonce}`);
    const bindingHash = sha256([
      "klol-v2:recruiting-nonce-binding:v1",
      idempotency.scope,
      Buffer.from(idempotency.keyHash).toString("hex"),
      Buffer.from(idempotency.requestFingerprint).toString("hex"),
      idempotency.bodyDigestHex,
    ].join("\0"));
    const lockKey = `${actor.principalId}:${nonceHash.toString("hex")}`;
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const current = (
      await transaction.select().from(recruitingNonceBindings).where(
        and(eq(recruitingNonceBindings.actorPrincipalId, actor.principalId), eq(recruitingNonceBindings.nonceHash, nonceHash)),
      ).limit(1)
    )[0];
    const now = new Date();
    if (current && current.expiresAt > now) {
      if (!sameBytes(current.bindingHash, bindingHash)) {
        throw new RecruitingApplicationError("FORBIDDEN", "The signed nonce is already bound to another request.");
      }
      return;
    }
    const values = {
      actorKind: actor.kind,
      actorPrincipalId: actor.principalId,
      nonceHash,
      bindingHash,
      keyId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + NONCE_TTL_MILLISECONDS),
    };
    if (current) {
      await transaction.update(recruitingNonceBindings).set(values).where(eq(recruitingNonceBindings.id, current.id));
    } else {
      await transaction.insert(recruitingNonceBindings).values({ id: randomUUID(), ...values });
    }
  }

  async claim(context: RecruitingTransactionContext, command: RecruitingCommand) {
    const transaction = this.transactionFor(context);
    const identity = command.metadata.idempotency;
    const principalId = command.metadata.actor.principalId;
    const lockKey = `${principalId}:${identity.scope}:${Buffer.from(identity.keyHash).toString("hex")}`;
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const current = (
      await transaction.select().from(recruitingCommandReceipts).where(and(
        eq(recruitingCommandReceipts.actorPrincipalId, principalId),
        eq(recruitingCommandReceipts.scope, identity.scope),
        eq(recruitingCommandReceipts.keyHash, Buffer.from(identity.keyHash)),
      )).limit(1)
    )[0];
    const now = new Date();
    if (current && current.expiresAt > now) {
      if (!sameBytes(current.requestHash, identity.requestFingerprint) || current.bodyDigestHex !== identity.bodyDigestHex) {
        return { kind: "MISMATCH" as const };
      }
      const receipt = receiptFromRow(current);
      if (!receipt) throw new Error("A recruiting receipt remained incomplete after its transaction committed.");
      return { kind: "REPLAY" as const, receipt };
    }
    const values = {
      actorPrincipalId: principalId,
      scope: identity.scope,
      keyHash: Buffer.from(identity.keyHash),
      requestHash: Buffer.from(identity.requestFingerprint),
      bodyDigestHex: identity.bodyDigestHex,
      responseStatus: null,
      responseJson: null,
      responseRevision: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + RECEIPT_TTL_MILLISECONDS),
    };
    if (current) await transaction.update(recruitingCommandReceipts).set(values).where(eq(recruitingCommandReceipts.id, current.id));
    else await transaction.insert(recruitingCommandReceipts).values({ id: randomUUID(), ...values });
    return { kind: "CLAIMED" as const };
  }

  async complete(context: RecruitingTransactionContext, receipt: RecruitCommandReceipt) {
    const transaction = this.transactionFor(context);
    const updated = await transaction.update(recruitingCommandReceipts).set({
      responseStatus: receipt.responseStatus,
      responseJson: receipt.body,
      responseRevision: receipt.revision,
      createdAt: new Date(receipt.createdAt),
      expiresAt: new Date(receipt.expiresAt),
    }).where(and(
      eq(recruitingCommandReceipts.actorPrincipalId, receipt.actorPrincipalId),
      eq(recruitingCommandReceipts.scope, receipt.scope),
      eq(recruitingCommandReceipts.keyHash, Buffer.from(receipt.keyHash)),
      eq(recruitingCommandReceipts.requestHash, Buffer.from(receipt.requestHash)),
    )).returning({ id: recruitingCommandReceipts.id });
    if (updated.length !== 1) throw new Error("Recruiting receipt claim disappeared before completion.");
  }

  async loadPartyForUpdate(context: RecruitingTransactionContext, partyId: string) {
    const row = (await this.transactionFor(context).select().from(recruitParties).where(eq(recruitParties.id, partyId)).for("update").limit(1))[0];
    return row ? partyFromRow(row) : null;
  }

  async allocateNextPartyIdentityForUpdate(
    context: RecruitingTransactionContext,
    input: Readonly<{ sourceRoomId: string; recruitDate: string; preferredRecruitNumber: number | null }>,
  ) {
    const transaction = this.transactionFor(context);
    const lockKey = `kakao-v1-party-number:${input.recruitDate}`;
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const latest = (await transaction.select({
      resetSequence: recruitParties.resetSequence,
      recruitNumber: recruitParties.recruitNumber,
    }).from(recruitParties).where(eq(recruitParties.recruitDate, input.recruitDate))
      .orderBy(desc(recruitParties.resetSequence), desc(recruitParties.recruitNumber)).limit(1))[0];
    if (!latest) return { resetSequence: 0, recruitNumber: input.preferredRecruitNumber ?? 1 };
    if (input.preferredRecruitNumber !== null) {
      const existing = (await transaction.select({ id: recruitParties.id }).from(recruitParties).where(and(
        eq(recruitParties.recruitDate, input.recruitDate),
        eq(recruitParties.resetSequence, latest.resetSequence),
        eq(recruitParties.recruitNumber, input.preferredRecruitNumber),
      )).limit(1))[0];
      return existing ? null : { resetSequence: latest.resetSequence, recruitNumber: input.preferredRecruitNumber };
    }
    if (latest.recruitNumber >= 99) return null;
    return { resetSequence: latest.resetSequence, recruitNumber: latest.recruitNumber + 1 };
  }

  async loadScrimForUpdate(context: RecruitingTransactionContext, scrimId: string) {
    const row = (await this.transactionFor(context).select().from(scrimRecruits).where(eq(scrimRecruits.id, scrimId)).for("update").limit(1))[0];
    return row ? scrimFromRow(row) : null;
  }

  async allocateNextScrimNumberForUpdate(context: RecruitingTransactionContext, recruitDate: string) {
    const transaction = this.transactionFor(context);
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-v1-scrim-number:${recruitDate}`}, 0))`);
    const latest = (await transaction.select({ scrimNumber: scrimRecruits.scrimNumber }).from(scrimRecruits)
      .where(eq(scrimRecruits.recruitDate, recruitDate))
      .orderBy(desc(scrimRecruits.scrimNumber)).limit(1))[0];
    if (!latest) return 1;
    return latest.scrimNumber < 99 ? latest.scrimNumber + 1 : null;
  }

  async listActiveDestructionTournamentIdsForUpdate(context: RecruitingTransactionContext) {
    const transaction = this.transactionFor(context);
    // V1 omits the tournament identity. Freeze this small catalog only for the
    // inference transaction so a concurrent create/status change cannot turn a
    // uniquely resolved target into an ambiguous one before the scrim FK is saved.
    await transaction.execute(sql`lock table ${destructionCompetitions} in share mode`);
    const rows = await transaction
      .select({ id: destructionCompetitions.id })
      .from(destructionCompetitions)
      .where(inArray(destructionCompetitions.status, ACTIVE_DESTRUCTION_STATUSES))
      .orderBy(desc(destructionCompetitions.updatedAt), desc(destructionCompetitions.id))
      .for("share")
      .limit(2);
    return rows.map((row) => row.id);
  }

  async saveParty(context: RecruitingTransactionContext, input: Readonly<{ party: RecruitParty; expectedRevision: number; create: boolean }>) {
    const transaction = this.transactionFor(context);
    const actor = this.actors.get(context)?.actor;
    const values = {
      revision: input.party.revision,
      sourceRoomId: input.party.sourceRoomId,
      sourceSenderId: input.party.sourceSenderId,
      recruitDate: input.party.recruitDate,
      resetSequence: input.party.resetSequence,
      recruitNumber: input.party.recruitNumber,
      type: input.party.type,
      status: input.party.status,
      title: input.party.title,
      maximumMembers: input.party.maximumMembers,
      membersJson: input.party.members,
      startTimeText: input.party.startTimeText,
      gameInfo: input.party.gameInfo,
      scheduledStartAt: input.party.scheduledStartAt,
      protectedUntil: input.party.protectedUntil,
      lastActivityAt: input.party.lastActivityAt,
      updatedAt: input.party.lastActivityAt,
    };
    if (input.create) {
      await transaction.insert(recruitParties).values({
        id: input.party.id,
        ownerUserAccountId: actor?.kind === "ACCOUNT" ? actor.principalId : null,
        createdAt: input.party.lastActivityAt,
        ...values,
      });
      return;
    }
    const updated = await transaction.update(recruitParties).set(values).where(and(
      eq(recruitParties.id, input.party.id),
      eq(recruitParties.revision, input.expectedRevision),
    )).returning({ id: recruitParties.id });
    if (updated.length !== 1) throw new RecruitingApplicationError("REVISION_CONFLICT", "Recruit party revision changed.");
  }

  async saveScrim(context: RecruitingTransactionContext, input: Readonly<{ scrim: ScrimRecruit; expectedRevision: number; create: boolean }>) {
    const transaction = this.transactionFor(context);
    const actor = this.actors.get(context)?.actor;
    const now = new Date();
    const values = {
      revision: input.scrim.revision,
      sourceRoomId: input.scrim.sourceRoomId,
      sourceSenderId: input.scrim.sourceSenderId,
      opponentSenderId: input.scrim.opponentSenderId,
      recruitDate: input.scrim.recruitDate,
      scrimNumber: input.scrim.scrimNumber,
      tournamentId: input.scrim.tournamentId,
      legacyTournamentNumber: input.scrim.legacyTournamentNumber,
      requesterTeamId: input.scrim.requesterTeamId,
      opponentTeamId: input.scrim.opponentTeamId,
      legacyTitle: input.scrim.legacyTitle,
      requesterTeamName: input.scrim.requesterTeamName,
      opponentTeamName: input.scrim.opponentTeamName,
      requesterLineupJson: input.scrim.requesterLineup,
      opponentLineupJson: input.scrim.opponentLineup,
      legacyMemo: input.scrim.legacyMemo,
      legacySeriesRuleText: input.scrim.legacySeriesRuleText,
      status: input.scrim.status,
      scheduledAt: input.scrim.scheduledAt,
      bestOf: input.scrim.bestOf,
      updatedAt: now,
    };
    if (input.create) {
      await transaction.insert(scrimRecruits).values({
        id: input.scrim.id,
        ownerUserAccountId: actor?.kind === "ACCOUNT" ? actor.principalId : null,
        createdAt: now,
        ...values,
      });
      return;
    }
    const updated = await transaction.update(scrimRecruits).set(values).where(and(
      eq(scrimRecruits.id, input.scrim.id),
      eq(scrimRecruits.revision, input.expectedRevision),
    )).returning({ id: scrimRecruits.id });
    if (updated.length !== 1) throw new RecruitingApplicationError("REVISION_CONFLICT", "Scrim revision changed.");
  }

  async appendAudit(context: RecruitingTransactionContext, event: RecruitingAuditEvent) {
    const actor = this.actors.get(context)?.actor;
    await this.transactionFor(context).insert(auditEvents).values({
      requestId: event.requestId,
      actorUserAccountId: actor?.kind === "ACCOUNT" || actor?.kind === "ADMIN" ? actor.principalId : null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      beforeJson: event.before,
      afterJson: event.after,
      metadataJson: actor ? { actorKind: actor.kind, actorPrincipalId: actor.principalId } : undefined,
      createdAt: new Date(event.occurredAt),
    });
  }

  async appendOutbox(context: RecruitingTransactionContext, event: RecruitingOutboxEvent) {
    await this.transactionFor(context).insert(recruitingOutbox).values({
      id: event.id,
      requestId: event.requestId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateRevision: event.aggregateRevision,
      eventType: event.eventType,
      dedupeKey: event.dedupeKey,
      payloadJson: event.payload,
      createdAt: new Date(event.occurredAt),
    });
  }

  auditPort() {
    return { append: this.appendAudit.bind(this) };
  }

  outboxPort() {
    return { append: this.appendOutbox.bind(this) };
  }

  async listPublicFeed() {
    const [partyRows, scrimRows] = await Promise.all([
      this.database.select().from(recruitParties).where(inArray(recruitParties.status, ["IN_PROGRESS"])).orderBy(desc(recruitParties.recruitDate), recruitParties.recruitNumber).limit(60),
      this.database.select().from(scrimRecruits).where(inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"])).orderBy(desc(scrimRecruits.recruitDate), scrimRecruits.scrimNumber).limit(60),
    ]);
    return {
      parties: partyRows.map((row) => toPublicPartyDto(partyFromRow(row))),
      scrims: scrimRows.map((row) => toPublicScrimDto(scrimFromRow(row))),
    };
  }

  async getAdminStatus(): Promise<AdminRecruitingStatusDto> {
    const now = new Date();
    const [partyCountRows, scrimCountRows, outboxCountRows, incompleteReceiptRows, activeNonceRows, activeImageRows, unresolvedSeasonRows, recentReceiptRows, partyRows, scrimRows] = await Promise.all([
      this.database.select({ value: count() }).from(recruitParties).where(eq(recruitParties.status, "IN_PROGRESS")),
      this.database.select({ value: count() }).from(scrimRecruits).where(inArray(scrimRecruits.status, ["RECRUITING", "MATCHED", "CONFIRMED"])),
      this.database.select({ value: count() }).from(recruitingOutbox).where(eq(recruitingOutbox.status, "PENDING")),
      this.database.select({ value: count() }).from(recruitingCommandReceipts).where(isNull(recruitingCommandReceipts.responseStatus)),
      this.database.select({ value: count() }).from(recruitingNonceBindings).where(gt(recruitingNonceBindings.expiresAt, now)),
      this.database.select({ value: count() }).from(kakaoImageSessions).where(and(eq(kakaoImageSessions.status, "ACTIVE"), gt(kakaoImageSessions.expiresAt, now))),
      this.database.select({ value: count() }).from(seasonKakaoPendingApplications).where(eq(seasonKakaoPendingApplications.status, "ACTIVE")),
      this.database.select({ scope: recruitingCommandReceipts.scope, responseStatus: recruitingCommandReceipts.responseStatus, createdAt: recruitingCommandReceipts.createdAt, expiresAt: recruitingCommandReceipts.expiresAt }).from(recruitingCommandReceipts).orderBy(desc(recruitingCommandReceipts.createdAt)).limit(30),
      this.database.select().from(recruitParties).orderBy(desc(recruitParties.updatedAt), desc(recruitParties.id)).limit(30),
      this.database.select().from(scrimRecruits).orderBy(desc(scrimRecruits.updatedAt), desc(scrimRecruits.id)).limit(30),
    ]);
    return {
      openPartyCount: partyCountRows[0]?.value ?? 0,
      openScrimCount: scrimCountRows[0]?.value ?? 0,
      pendingOutboxCount: outboxCountRows[0]?.value ?? 0,
      incompleteReceiptCount: incompleteReceiptRows[0]?.value ?? 0,
      activeNonceCount: activeNonceRows[0]?.value ?? 0,
      activeImageSessionCount: activeImageRows[0]?.value ?? 0,
      unresolvedSeasonApplicationCount: unresolvedSeasonRows[0]?.value ?? 0,
      recentRequests: recentReceiptRows.map((row) => ({ scope: row.scope, completed: row.responseStatus !== null, responseStatus: row.responseStatus, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() })),
      recentParties: partyRows.map((row) => ({
        id: row.id, revision: row.revision, recruitDate: row.recruitDate, recruitNumber: row.recruitNumber,
        status: row.status, title: row.title, memberCount: partyFromRow(row).members.filter((member) => !member.substitute).length,
        maximumMembers: row.maximumMembers, updatedAt: row.updatedAt.toISOString(),
      })),
      recentScrims: scrimRows.map((row) => ({
        id: row.id, revision: row.revision, recruitDate: row.recruitDate, scrimNumber: row.scrimNumber,
        status: row.status, requesterTeamId: row.requesterTeamId, opponentTeamId: row.opponentTeamId,
        requesterTeamName: row.requesterTeamName, opponentTeamName: row.opponentTeamName,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
