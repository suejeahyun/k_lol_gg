import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { createStagedPrivateAsset, finalizeStagedPrivateAsset, validatePrivateAssetUpload, type PrivateAssetPurpose } from "@/modules/assets/domain/private-asset";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { APPROVED_ACCOUNT_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import type { PrivateImageStorage } from "@/modules/matches/application/ports/private-image-storage";
import { validatePrivateScoreboardImage } from "@/modules/matches/infrastructure/private-image";
import type { V2Database } from "@/platform/db/database";
import { auditEvents } from "@/platform/db/schema/audit";
import { disciplineAssetBindings, disciplineEvidence, disciplineResolutionTasks } from "@/platform/db/schema/discipline";
import { matchSubmissionImages, matchSubmissions, privateAssets } from "@/platform/db/schema/matches";
import { kakaoImageSessions, kakaoInboundImages, recruitingCommandReceipts, recruitingNonceBindings, recruitingOutbox } from "@/platform/db/schema/recruiting";
import { players } from "@/platform/db/schema/registry";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import { KakaoAssistantError, kakaoReadIdentity, type KakaoImageReceiveCommand, type KakaoImageReceiveDto, type KakaoImageSessionDto } from "./domain";

const RECEIPT_TTL = 24 * 60 * 60 * 1_000;
const NONCE_TTL = 15 * 60 * 1_000;
const SESSION_TTL = 30 * 60 * 1_000;

type ReceiveInput = Readonly<{
  actorPrincipalId: string; intent: VerifiedKakaoWebhookIntent; requestKey: string;
  scope: string; requestId: string; command: KakaoImageReceiveCommand; now?: Date;
}>;
type OwnerMutationInput = Readonly<{
  actorSession: TransactionSessionActor; targetType: "MATCH_SUBMISSION" | "DISCIPLINE_TASK";
  targetReference: string; expectedRevision: number; requestKey: string; bodyDigestHex: string;
  requestId: string; scope: string; now?: Date;
}>;
type CreateOwnerSessionInput = OwnerMutationInput & Readonly<{ roomId: string; senderId: string }>;
type RevokeOwnerSessionInput = OwnerMutationInput & Readonly<{ sessionId: string }>;

export type KakaoImageReceiveResult = Readonly<{ body: KakaoImageReceiveDto; replayed: boolean }>;
export type KakaoImageSessionResult = Readonly<{ body: KakaoImageSessionDto; revision: number; replayed: boolean }>;

type Target = Readonly<{
  targetType: "MATCH_SUBMISSION" | "DISCIPLINE_TASK"; targetId: string; expectedImageCount: number;
  receivedImageCount: number; ownerUserAccountId: string; purpose: PrivateAssetPurpose; revision: number;
}>;

const sameBytes = (left: Uint8Array, right: Uint8Array) => Buffer.from(left).equals(Buffer.from(right));
const hiddenIdentity = (kind: "room" | "sender", value: string) => createHash("sha256").update(`klol-v2:kakao-image-${kind}:v1\0${value}`).digest();
const matchesRoomScope = (expected: Uint8Array, intent: VerifiedKakaoWebhookIntent) => [intent.installationId, intent.localRoomFingerprint, intent.roomId]
  .filter((value): value is string => Boolean(value))
  .some((value) => sameBytes(expected, hiddenIdentity("room", value)));
const ownerPrincipal = (actor: TransactionSessionActor) => `account:${actor.userAccountId}`;

function decodeCanonicalBase64(value: string) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 12 || bytes.toString("base64") !== value) throw new KakaoAssistantError("INVALID_INPUT");
  return bytes;
}

export class PostgresKakaoImageReceive {
  constructor(private readonly database: V2Database, private readonly storage: PrivateImageStorage) {}

  async createOwnerSession(input: CreateOwnerSessionInput): Promise<KakaoImageSessionResult> {
    const now = input.now ?? new Date();
    return withTransaction(this.database, async (transaction) => {
      await this.recheckOwner(transaction, input.actorSession, now);
      const replay = await this.claimOwnerReceipt(transaction, input, now);
      if (replay) return { ...replay, replayed: true };
      const target = await this.resolveOwnedTarget(transaction, input, now);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-image-target:${target.targetType}:${target.targetId}`}, 0))`);
      const roomIdHash = hiddenIdentity("room", input.roomId);
      const senderIdHash = hiddenIdentity("sender", input.senderId);
      const active = await transaction.select({ id: kakaoImageSessions.id }).from(kakaoImageSessions).where(and(
        eq(kakaoImageSessions.status, "ACTIVE"),
        or(
          and(eq(kakaoImageSessions.targetType, target.targetType), eq(kakaoImageSessions.targetId, target.targetId)),
          and(eq(kakaoImageSessions.roomIdHash, roomIdHash), eq(kakaoImageSessions.senderIdHash, senderIdHash)),
        ),
      )).for("update");
      for (const row of active) {
        await transaction.update(kakaoImageSessions).set({ status: "CANCELLED", cancelledAt: now, updatedAt: now }).where(eq(kakaoImageSessions.id, row.id));
      }
      const id = randomUUID();
      const expiresAt = new Date(now.getTime() + SESSION_TTL);
      await transaction.insert(kakaoImageSessions).values({
        id, createdByUserAccountId: input.actorSession.userAccountId, targetType: target.targetType,
        targetId: target.targetId, roomIdHash, senderIdHash, expectedImageCount: target.expectedImageCount,
        receivedImageCount: target.receivedImageCount, status: "ACTIVE", expiresAt, createdAt: now, updatedAt: now,
      });
      const body: KakaoImageSessionDto = Object.freeze({
        kind: "KAKAO_IMAGE_SESSION", sessionId: id, targetType: target.targetType,
        receivedImageCount: target.receivedImageCount, expectedImageCount: target.expectedImageCount,
        status: "ACTIVE", expiresAt: expiresAt.toISOString(),
      });
      await this.finishOwnerMutation(transaction, input, body, target.revision, "KAKAO_IMAGE_SESSION_CREATED", id, now);
      return { body, revision: target.revision, replayed: false };
    });
  }

  async revokeOwnerSession(input: RevokeOwnerSessionInput): Promise<KakaoImageSessionResult> {
    const now = input.now ?? new Date();
    return withTransaction(this.database, async (transaction) => {
      await this.recheckOwner(transaction, input.actorSession, now);
      const replay = await this.claimOwnerReceipt(transaction, input, now);
      if (replay) return { ...replay, replayed: true };
      const target = await this.resolveOwnedTarget(transaction, input, now, true);
      const session = (await transaction.select().from(kakaoImageSessions).where(and(
        eq(kakaoImageSessions.id, input.sessionId), eq(kakaoImageSessions.createdByUserAccountId, input.actorSession.userAccountId),
        eq(kakaoImageSessions.targetType, target.targetType), eq(kakaoImageSessions.targetId, target.targetId),
      )).for("update").limit(1))[0];
      if (!session) throw new KakaoAssistantError("NOT_FOUND");
      if (session.status !== "ACTIVE") throw new KakaoAssistantError("CONFLICT");
      await transaction.update(kakaoImageSessions).set({ status: "CANCELLED", cancelledAt: now, updatedAt: now }).where(eq(kakaoImageSessions.id, session.id));
      const body: KakaoImageSessionDto = Object.freeze({
        kind: "KAKAO_IMAGE_SESSION", sessionId: session.id, targetType: session.targetType,
        receivedImageCount: session.receivedImageCount, expectedImageCount: session.expectedImageCount,
        status: "CANCELLED", expiresAt: session.expiresAt.toISOString(),
      });
      await this.finishOwnerMutation(transaction, input, body, target.revision, "KAKAO_IMAGE_SESSION_REVOKED", session.id, now);
      return { body, revision: target.revision, replayed: false };
    });
  }

  async receive(input: ReceiveInput): Promise<KakaoImageReceiveResult> {
    const now = input.now ?? new Date();
    const bytes = decodeCanonicalBase64(input.command.base64Image);
    const inspected = await validatePrivateScoreboardImage({ bytes, declaredContentType: input.command.declaredContentType })
      .catch(() => { throw new KakaoAssistantError("INVALID_INPUT"); });
    const upload = validatePrivateAssetUpload({
      bytes, declaredContentType: input.command.declaredContentType,
      declaredSha256Hex: input.command.declaredSha256Hex, originalFileName: input.command.originalFileName,
      inspection: { contentType: inspected.contentType, width: inspected.width, height: inspected.height, pageCount: 1, decoded: true },
    });
    const reserved = await withTransaction(this.database, async (transaction) => {
      const replay = await this.claimBotRequest(transaction, input, now);
      if (replay) return { replay } as const;
      const session = (await transaction.select().from(kakaoImageSessions).where(eq(kakaoImageSessions.id, input.command.sessionId)).for("update").limit(1))[0];
      if (!session || !matchesRoomScope(session.roomIdHash, input.intent) || !sameBytes(session.senderIdHash, hiddenIdentity("sender", input.intent.senderId))) {
        throw new KakaoAssistantError("NOT_FOUND");
      }
      if (session.status !== "ACTIVE") throw new KakaoAssistantError("CONFLICT");
      if (session.expiresAt <= now) {
        await transaction.update(kakaoImageSessions).set({ status: "EXPIRED", cancelledAt: now, updatedAt: now }).where(eq(kakaoImageSessions.id, session.id));
        throw new KakaoAssistantError("NOT_FOUND");
      }
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-image-target:${session.targetType}:${session.targetId}`}, 0))`);
      const target = await this.resolveSessionTarget(transaction, session.targetType, session.targetId, session.createdByUserAccountId, now);
      if (!target) throw new KakaoAssistantError("NOT_FOUND");
      if (target.receivedImageCount >= target.expectedImageCount) throw new KakaoAssistantError("CONFLICT");
      const duplicate = target.targetType === "DISCIPLINE_TASK"
        ? (await transaction.select({ id: privateAssets.id }).from(privateAssets).innerJoin(disciplineAssetBindings, eq(disciplineAssetBindings.privateAssetId, privateAssets.id)).where(and(eq(disciplineAssetBindings.taskId, target.targetId), eq(privateAssets.sha256, Buffer.from(upload.sha256)))).limit(1))[0]
        : (await transaction.select({ id: privateAssets.id }).from(privateAssets).innerJoin(matchSubmissionImages, eq(matchSubmissionImages.privateAssetId, privateAssets.id)).where(and(eq(matchSubmissionImages.submissionId, target.targetId), eq(privateAssets.sha256, Buffer.from(upload.sha256)))).limit(1))[0];
      if (duplicate) throw new KakaoAssistantError("CONFLICT");
      const assetId = randomUUID();
      const imageNumber = target.receivedImageCount + 1;
      const storageKey = `kakao/${target.targetType.toLowerCase()}/${target.targetId}/${assetId}/${upload.sha256Hex.slice(0, 16)}`;
      const asset = createStagedPrivateAsset({
        id: assetId, createdByUserAccountId: null, ingestSource: "KAKAO_SERVICE",
        storageProvider: this.storage.storageProvider, storageKey, purpose: target.purpose, upload, now: now.toISOString(),
      });
      await transaction.insert(privateAssets).values({
        id: asset.id, createdByUserAccountId: asset.createdByUserAccountId, ingestSource: asset.ingestSource,
        storageProvider: asset.storageProvider, storageKey: asset.storageKey, originalFileName: asset.originalFileName,
        contentType: asset.contentType, byteSize: asset.byteSize, width: asset.width, height: asset.height,
        sha256: Buffer.from(asset.sha256), purpose: asset.purpose, status: asset.status, createdAt: now,
      });
      if (target.targetType === "DISCIPLINE_TASK") {
        await transaction.insert(disciplineAssetBindings).values({ privateAssetId: asset.id, taskId: target.targetId, ownerUserAccountId: target.ownerUserAccountId, createdAt: now });
      }
      const inboundId = randomUUID();
      await transaction.insert(kakaoInboundImages).values({
        id: inboundId, sessionId: session.id, privateAssetId: asset.id, imageNumber,
        requestDigest: Buffer.from(input.intent.bodyDigestHex, "hex"), sha256: Buffer.from(asset.sha256), status: "STAGED", createdAt: now,
      });
      await transaction.insert(auditEvents).values({
        requestId: input.requestId, actorUserAccountId: session.createdByUserAccountId, action: "PRIVATE_ASSET_STAGED",
        targetType: "PRIVATE_ASSET", targetId: asset.id,
        metadataJson: { actorPurpose: "BOT", resourceType: target.targetType, resourceId: target.targetId, purpose: target.purpose, succeeded: true }, createdAt: now,
      });
      return { asset, inboundId, sessionId: session.id, imageNumber, target } as const;
    });
    if ("replay" in reserved && reserved.replay) return { body: reserved.replay, replayed: true };
    try {
      await this.storage.stageAt({ storageKey: reserved.asset.storageKey, bytes: upload.bytes, sha256Hex: upload.sha256Hex, signal: AbortSignal.timeout(8_000) });
    } catch {
      await this.compensate(reserved.asset.id, reserved.inboundId, reserved.asset.storageKey, input.requestId, now);
      throw new KakaoAssistantError("CONFLICT");
    }
    try {
      return await this.finalizeReceive(input, reserved);
    } catch (error) {
      await this.compensate(reserved.asset.id, reserved.inboundId, reserved.asset.storageKey, input.requestId, new Date());
      throw error;
    }
  }

  private async finalizeReceive(input: ReceiveInput, reserved: Readonly<{ asset: ReturnType<typeof createStagedPrivateAsset>; inboundId: string; sessionId: string; imageNumber: number; target: Target }>): Promise<KakaoImageReceiveResult> {
    return withTransaction(this.database, async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`kakao-image-target:${reserved.target.targetType}:${reserved.target.targetId}`}, 0))`);
      const session = (await transaction.select().from(kakaoImageSessions).where(eq(kakaoImageSessions.id, reserved.sessionId)).for("update").limit(1))[0];
      const assetRow = (await transaction.select().from(privateAssets).where(eq(privateAssets.id, reserved.asset.id)).for("update").limit(1))[0];
      const inbound = (await transaction.select().from(kakaoInboundImages).where(eq(kakaoInboundImages.id, reserved.inboundId)).for("update").limit(1))[0];
      const readyAt = new Date();
      if (!session || session.status !== "ACTIVE" || session.expiresAt <= readyAt || !assetRow || assetRow.status !== "STAGED" || !inbound || inbound.status !== "STAGED") throw new KakaoAssistantError("CONFLICT");
      const ready = finalizeStagedPrivateAsset(reserved.asset, readyAt.toISOString());
      await transaction.update(privateAssets).set({ status: "READY", readyAt, deleteRequestedAt: null }).where(eq(privateAssets.id, ready.id));
      if (reserved.target.targetType === "DISCIPLINE_TASK") {
        const owned = (await transaction.select({ task: disciplineResolutionTasks, playerAccountId: players.userAccountId }).from(disciplineResolutionTasks).leftJoin(players, eq(players.id, disciplineResolutionTasks.ownerPlayerId)).where(eq(disciplineResolutionTasks.id, reserved.target.targetId)).for("update", { of: disciplineResolutionTasks }).limit(1))[0];
        const task = owned?.task;
        if (!task || (task.ownerUserAccountId ?? owned.playerAccountId) !== session.createdByUserAccountId || !["REQUIRED", "AWAITING_UPLOAD", "REJECTED"].includes(task.status) || task.dueAt <= readyAt) throw new KakaoAssistantError("CONFLICT");
        await transaction.insert(disciplineEvidence).values({ id: randomUUID(), taskId: task.id, privateAssetId: ready.id, submittedAt: readyAt });
        const count = (await transaction.select({ value: sql<number>`count(*)::int` }).from(disciplineEvidence).where(and(eq(disciplineEvidence.taskId, task.id), isNull(disciplineEvidence.supersededAt))))[0]?.value ?? 0;
        await transaction.update(disciplineResolutionTasks).set({ status: count >= task.requiredGameCount ? "PENDING_REVIEW" : "AWAITING_UPLOAD", revision: sql`${disciplineResolutionTasks.revision} + 1`, updatedAt: readyAt }).where(eq(disciplineResolutionTasks.id, task.id));
      } else {
        const submission = (await transaction.select().from(matchSubmissions).where(and(eq(matchSubmissions.id, reserved.target.targetId), eq(matchSubmissions.ownerUserAccountId, session.createdByUserAccountId))).for("update").limit(1))[0];
        if (!submission || submission.source !== "WEB" || submission.status !== "AWAITING_UPLOAD") throw new KakaoAssistantError("CONFLICT");
        await transaction.insert(matchSubmissionImages).values({ id: randomUUID(), submissionId: submission.id, privateAssetId: ready.id, gameNumber: reserved.imageNumber, ocrStatus: "NOT_REQUESTED", createdAt: readyAt, updatedAt: readyAt });
        if (reserved.imageNumber >= submission.expectedGameCount) await transaction.update(matchSubmissions).set({ status: "PENDING_REVIEW", revision: sql`${matchSubmissions.revision} + 1`, updatedAt: readyAt }).where(eq(matchSubmissions.id, submission.id));
      }
      const completed = reserved.imageNumber >= reserved.target.expectedImageCount;
      await transaction.update(kakaoInboundImages).set({ status: "READY", readyAt }).where(eq(kakaoInboundImages.id, reserved.inboundId));
      await transaction.update(kakaoImageSessions).set({ receivedImageCount: reserved.imageNumber, status: completed ? "COMPLETE" : "ACTIVE", completedAt: completed ? readyAt : null, expiresAt: new Date(readyAt.getTime() + SESSION_TTL), updatedAt: readyAt }).where(eq(kakaoImageSessions.id, reserved.sessionId));
      const body: KakaoImageReceiveDto = Object.freeze({ kind: "KAKAO_IMAGE_RECEIVED", assetId: ready.id, imageNumber: reserved.imageNumber, receivedImageCount: reserved.imageNumber, expectedImageCount: reserved.target.expectedImageCount, completed });
      const identity = kakaoReadIdentity({ principalId: input.actorPrincipalId, scope: input.scope, requestKey: input.requestKey, bodyDigestHex: input.intent.bodyDigestHex });
      const receipt = await transaction.update(recruitingCommandReceipts).set({ responseStatus: 200, responseJson: body, responseRevision: reserved.imageNumber }).where(and(eq(recruitingCommandReceipts.actorPrincipalId, input.actorPrincipalId), eq(recruitingCommandReceipts.scope, input.scope), eq(recruitingCommandReceipts.keyHash, identity.keyHash), eq(recruitingCommandReceipts.requestHash, identity.requestHash))).returning({ id: recruitingCommandReceipts.id });
      if (receipt.length !== 1) throw new KakaoAssistantError("INCOMPLETE_RECEIPT");
      await transaction.insert(auditEvents).values({ requestId: input.requestId, actorUserAccountId: session.createdByUserAccountId, action: "PRIVATE_ASSET_READY", targetType: "PRIVATE_ASSET", targetId: ready.id, metadataJson: { actorPurpose: "BOT", resourceType: reserved.target.targetType, resourceId: reserved.target.targetId, purpose: ready.purpose, succeeded: true }, createdAt: readyAt });
      return { body, replayed: false };
    });
  }

  private async recheckOwner(transaction: V2Transaction, actor: TransactionSessionActor, now: Date) {
    const locked = await lockTransactionSessionActor(transaction, actor, now, APPROVED_ACCOUNT_MUTATION_SESSION_POLICY);
    if (!locked || locked.id !== actor.userAccountId) throw new KakaoAssistantError("FORBIDDEN");
  }

  private async resolveOwnedTarget(transaction: V2Transaction, input: OwnerMutationInput, now: Date, allowInactive = false): Promise<Target> {
    if (input.targetType === "MATCH_SUBMISSION") {
      const row = (await transaction.select().from(matchSubmissions).where(and(eq(matchSubmissions.publicCode, input.targetReference), eq(matchSubmissions.ownerUserAccountId, input.actorSession.userAccountId))).for("update").limit(1))[0];
      if (!row || row.source !== "WEB") throw new KakaoAssistantError("NOT_FOUND");
      if (row.revision !== input.expectedRevision) throw new KakaoAssistantError("PRECONDITION_FAILED");
      if (!allowInactive && row.status !== "AWAITING_UPLOAD") throw new KakaoAssistantError("CONFLICT");
      const received = (await transaction.select({ value: sql<number>`count(*)::int` }).from(matchSubmissionImages).where(eq(matchSubmissionImages.submissionId, row.id)))[0]?.value ?? 0;
      return { targetType: "MATCH_SUBMISSION", targetId: row.id, expectedImageCount: row.expectedGameCount, receivedImageCount: received, ownerUserAccountId: input.actorSession.userAccountId, purpose: "MATCH_SCOREBOARD", revision: row.revision };
    }
    const row = (await transaction.select({ task: disciplineResolutionTasks, playerAccountId: players.userAccountId }).from(disciplineResolutionTasks).leftJoin(players, eq(players.id, disciplineResolutionTasks.ownerPlayerId)).where(eq(disciplineResolutionTasks.id, input.targetReference)).for("update", { of: disciplineResolutionTasks }).limit(1))[0];
    const task = row?.task;
    if (!task || (task.ownerUserAccountId ?? row.playerAccountId) !== input.actorSession.userAccountId) throw new KakaoAssistantError("NOT_FOUND");
    if (task.revision !== input.expectedRevision) throw new KakaoAssistantError("PRECONDITION_FAILED");
    if (!allowInactive && (!["REQUIRED", "AWAITING_UPLOAD", "REJECTED"].includes(task.status) || task.dueAt <= now)) throw new KakaoAssistantError("CONFLICT");
    const received = (await transaction.select({ value: sql<number>`count(*)::int` }).from(disciplineEvidence).where(and(eq(disciplineEvidence.taskId, task.id), isNull(disciplineEvidence.supersededAt))))[0]?.value ?? 0;
    return { targetType: "DISCIPLINE_TASK", targetId: task.id, expectedImageCount: task.requiredGameCount, receivedImageCount: received, ownerUserAccountId: input.actorSession.userAccountId, purpose: "DISCIPLINE_RESOLUTION", revision: task.revision };
  }

  private async resolveSessionTarget(transaction: V2Transaction, type: Target["targetType"], id: string, ownerId: string, now: Date): Promise<Target | null> {
    if (type === "MATCH_SUBMISSION") {
      const row = (await transaction.select().from(matchSubmissions).where(and(eq(matchSubmissions.id, id), eq(matchSubmissions.ownerUserAccountId, ownerId))).for("update").limit(1))[0];
      if (!row || row.source !== "WEB" || row.status !== "AWAITING_UPLOAD") return null;
      const received = (await transaction.select({ value: sql<number>`count(*)::int` }).from(matchSubmissionImages).where(eq(matchSubmissionImages.submissionId, row.id)))[0]?.value ?? 0;
      return { targetType: type, targetId: id, expectedImageCount: row.expectedGameCount, receivedImageCount: received, ownerUserAccountId: ownerId, purpose: "MATCH_SCOREBOARD", revision: row.revision };
    }
    const row = (await transaction.select({ task: disciplineResolutionTasks, playerAccountId: players.userAccountId }).from(disciplineResolutionTasks).leftJoin(players, eq(players.id, disciplineResolutionTasks.ownerPlayerId)).where(eq(disciplineResolutionTasks.id, id)).for("update", { of: disciplineResolutionTasks }).limit(1))[0];
    const task = row?.task;
    if (!task || (task.ownerUserAccountId ?? row.playerAccountId) !== ownerId || !["REQUIRED", "AWAITING_UPLOAD", "REJECTED"].includes(task.status) || task.dueAt <= now) return null;
    const received = (await transaction.select({ value: sql<number>`count(*)::int` }).from(disciplineEvidence).where(and(eq(disciplineEvidence.taskId, task.id), isNull(disciplineEvidence.supersededAt))))[0]?.value ?? 0;
    return { targetType: type, targetId: id, expectedImageCount: task.requiredGameCount, receivedImageCount: received, ownerUserAccountId: ownerId, purpose: "DISCIPLINE_RESOLUTION", revision: task.revision };
  }

  private async claimOwnerReceipt(transaction: V2Transaction, input: OwnerMutationInput, now: Date) {
    const principal = ownerPrincipal(input.actorSession);
    const identity = kakaoReadIdentity({ principalId: principal, scope: input.scope, requestKey: input.requestKey, bodyDigestHex: input.bodyDigestHex });
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${principal}:${input.scope}:${identity.keyHash.toString("hex")}`}, 0))`);
    const current = (await transaction.select().from(recruitingCommandReceipts).where(and(eq(recruitingCommandReceipts.actorPrincipalId, principal), eq(recruitingCommandReceipts.scope, input.scope), eq(recruitingCommandReceipts.keyHash, identity.keyHash))).limit(1))[0];
    if (current && current.expiresAt > now) {
      if (!sameBytes(current.requestHash, identity.requestHash) || current.bodyDigestHex !== input.bodyDigestHex) throw new KakaoAssistantError("IDEMPOTENCY_MISMATCH");
      if (current.responseJson && current.responseRevision !== null) return { body: current.responseJson as KakaoImageSessionDto, revision: current.responseRevision };
      throw new KakaoAssistantError("CONFLICT");
    }
    const values = { actorPrincipalId: principal, scope: input.scope, keyHash: identity.keyHash, requestHash: identity.requestHash, bodyDigestHex: input.bodyDigestHex, responseStatus: null, responseJson: null, responseRevision: null, createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL) };
    if (current) await transaction.update(recruitingCommandReceipts).set(values).where(eq(recruitingCommandReceipts.id, current.id));
    else await transaction.insert(recruitingCommandReceipts).values({ id: randomUUID(), ...values });
    return null;
  }

  private async finishOwnerMutation(transaction: V2Transaction, input: OwnerMutationInput, body: KakaoImageSessionDto, revision: number, action: string, sessionId: string, now: Date) {
    const principal = ownerPrincipal(input.actorSession);
    const identity = kakaoReadIdentity({ principalId: principal, scope: input.scope, requestKey: input.requestKey, bodyDigestHex: input.bodyDigestHex });
    const updated = await transaction.update(recruitingCommandReceipts).set({ responseStatus: 200, responseJson: body, responseRevision: revision }).where(and(eq(recruitingCommandReceipts.actorPrincipalId, principal), eq(recruitingCommandReceipts.scope, input.scope), eq(recruitingCommandReceipts.keyHash, identity.keyHash), eq(recruitingCommandReceipts.requestHash, identity.requestHash))).returning({ id: recruitingCommandReceipts.id });
    if (updated.length !== 1) throw new KakaoAssistantError("INCOMPLETE_RECEIPT");
    await transaction.insert(auditEvents).values({ requestId: input.requestId, actorUserAccountId: input.actorSession.userAccountId, action, targetType: "KAKAO_IMAGE_SESSION", targetId: sessionId, metadataJson: { targetType: input.targetType, succeeded: true }, createdAt: now });
    await transaction.insert(recruitingOutbox).values({ id: `kakao-image-session:${input.requestId}`, requestId: input.requestId, aggregateType: "KAKAO_IMAGE_SESSION", aggregateId: sessionId, aggregateRevision: revision, eventType: action, dedupeKey: `kakao-image-session:${input.requestId}:${action}`, payloadJson: { sessionId, targetType: input.targetType, status: body.status, expiresAt: body.expiresAt }, createdAt: now });
  }

  private async claimBotRequest(transaction: V2Transaction, input: ReceiveInput, now: Date) {
    const identity = kakaoReadIdentity({ principalId: input.actorPrincipalId, scope: input.scope, requestKey: input.requestKey, bodyDigestHex: input.intent.bodyDigestHex });
    const nonceHash = createHash("sha256").update(`klol-v2:recruiting-nonce:v1\0${input.actorPrincipalId}\0${input.intent.nonce}`).digest();
    const bindingHash = createHash("sha256").update(["klol-v2:recruiting-nonce-binding:v1", input.scope, identity.keyHash.toString("hex"), identity.requestHash.toString("hex"), input.intent.bodyDigestHex].join("\0")).digest();
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorPrincipalId}:${nonceHash.toString("hex")}`}, 0))`);
    const nonce = (await transaction.select().from(recruitingNonceBindings).where(and(eq(recruitingNonceBindings.actorPrincipalId, input.actorPrincipalId), eq(recruitingNonceBindings.nonceHash, nonceHash))).limit(1))[0];
    if (nonce && nonce.expiresAt > now && !sameBytes(nonce.bindingHash, bindingHash)) throw new KakaoAssistantError("NONCE_CONFLICT");
    if (!nonce || nonce.expiresAt <= now) {
      const values = { actorKind: "BOT" as const, actorPrincipalId: input.actorPrincipalId, nonceHash, bindingHash, keyId: input.intent.keyId, createdAt: now, expiresAt: new Date(now.getTime() + NONCE_TTL) };
      if (nonce) await transaction.update(recruitingNonceBindings).set(values).where(eq(recruitingNonceBindings.id, nonce.id));
      else await transaction.insert(recruitingNonceBindings).values({ id: randomUUID(), ...values });
    }
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorPrincipalId}:${input.scope}:${identity.keyHash.toString("hex")}`}, 0))`);
    const receipt = (await transaction.select().from(recruitingCommandReceipts).where(and(eq(recruitingCommandReceipts.actorPrincipalId, input.actorPrincipalId), eq(recruitingCommandReceipts.scope, input.scope), eq(recruitingCommandReceipts.keyHash, identity.keyHash))).limit(1))[0];
    if (receipt && receipt.expiresAt > now) {
      if (!sameBytes(receipt.requestHash, identity.requestHash) || receipt.bodyDigestHex !== input.intent.bodyDigestHex) throw new KakaoAssistantError("IDEMPOTENCY_MISMATCH");
      if (receipt.responseStatus === 200 && receipt.responseJson) return receipt.responseJson as KakaoImageReceiveDto;
      throw new KakaoAssistantError("CONFLICT");
    }
    const values = { actorPrincipalId: input.actorPrincipalId, scope: input.scope, keyHash: identity.keyHash, requestHash: identity.requestHash, bodyDigestHex: input.intent.bodyDigestHex, responseStatus: null, responseJson: null, responseRevision: null, createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL) };
    if (receipt) await transaction.update(recruitingCommandReceipts).set(values).where(eq(recruitingCommandReceipts.id, receipt.id));
    else await transaction.insert(recruitingCommandReceipts).values({ id: randomUUID(), ...values });
    return null;
  }

  private async compensate(assetId: string, inboundId: string, storageKey: string, requestId: string, now: Date) {
    await this.storage.requestDelete(storageKey, AbortSignal.timeout(8_000)).catch(() => undefined);
    await withTransaction(this.database, async (transaction) => {
      await transaction.update(privateAssets).set({ status: "DELETE_PENDING", deleteRequestedAt: now }).where(and(eq(privateAssets.id, assetId), eq(privateAssets.status, "STAGED")));
      await transaction.update(kakaoInboundImages).set({ status: "DELETE_PENDING", deleteRequestedAt: now }).where(and(eq(kakaoInboundImages.id, inboundId), eq(kakaoInboundImages.status, "STAGED")));
      await transaction.insert(auditEvents).values({ requestId, action: "PRIVATE_ASSET_STAGE_COMPENSATED", targetType: "PRIVATE_ASSET", targetId: assetId, metadataJson: { actorPurpose: "BOT", succeeded: false }, createdAt: now });
    });
  }
}
