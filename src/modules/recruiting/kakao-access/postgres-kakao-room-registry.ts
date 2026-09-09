import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { OperationsActor, OperationsCommandMetadata } from "@/modules/operations/application/ports";
import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import { userAccounts } from "@/platform/db/schema/auth";
import { kakaoBotInstallations, kakaoRoomBindings, kakaoRoomMembers, kakaoRoomPairings, kakaoRooms, operationForms, recruitParties, recruitingCommandReceipts, recruitingNonceBindings, scrimRecruits } from "@/platform/db/schema/recruiting";
import type { V2Database } from "@/platform/db/database";
import { withTransaction, type V2Transaction } from "@/platform/db/transaction";

import { isKakaoFingerprint, isStableKakaoSenderFingerprint, kakaoRoleAtLeast, parsePairingCode, type KakaoRoomMemberRole, type KakaoRoomStatus } from "./domain";

export class KakaoRoomRegistryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "INSTALLATION_KEY_MISMATCH" | "INSTALLATION_REVOKED" | "ROOM_BINDING_REQUIRED" | "ROOM_NOT_REGISTERED" | "ROOM_PAUSED" | "ROLE_FORBIDDEN" | "PAIRING_EXPIRED" | "PAIRING_REPLAY" | "CONFLICT" | "PRECONDITION_FAILED" | "SESSION_STALE" | "UNAVAILABLE") { super(code); }
}

const pairingHash = (code: string) => createHash("sha256").update(`klol-v2:kakao-room-pairing:v2\0${code}`).digest();
const hint = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;
const roleRank = (role: KakaoRoomMemberRole) => ({ MEMBER: 0, MANAGER: 1, ADMIN: 2 } as const)[role];
const adminKeyHash = (key: string) => createHash("sha256").update(`klol-v2:kakao-admin-key:v1\0${key}`).digest();
const pairingRequestKeyHash = (key: string) => createHash("sha256").update(`klol-v2:kakao-pairing-request:v1\0${key}`).digest();

export type KakaoRoomAuthorization = Readonly<{ roomId: string; roomStatus: "ACTIVE"; installationId: string; memberId: string; role: KakaoRoomMemberRole }>;
export type KakaoRoomBootstrapEnvironment = Readonly<{
  KAKAO_WEBHOOK_ALLOWED_ROOMS?: string;
  /** Legacy emergency import only. Normal request authorization never reads this value. */
  KAKAO_WEBHOOK_ALLOWED_SENDERS?: string;
}>;

export class PostgresKakaoRoomRegistry {
  constructor(private readonly database: V2Database) {}

  private async claimAdminReceipt(transaction: V2Transaction, actorId: string, scope: string, metadata: OperationsCommandMetadata) {
    const principal = `account:${actorId}`; const keyHash = adminKeyHash(metadata.requestKey); const requestHash = Buffer.from(metadata.requestHashHex, "hex");
    const lock = `${principal}:${scope}:${keyHash.toString("hex")}`; await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
    const current = (await transaction.select().from(recruitingCommandReceipts).where(and(eq(recruitingCommandReceipts.actorPrincipalId, principal), eq(recruitingCommandReceipts.scope, scope), eq(recruitingCommandReceipts.keyHash, keyHash))).for("update").limit(1))[0];
    if (current) {
      if (!Buffer.from(current.requestHash).equals(requestHash)) throw new KakaoRoomRegistryError("CONFLICT");
      if (!current.responseJson) throw new KakaoRoomRegistryError("CONFLICT");
      return { replayed: true as const, body: current.responseJson, revision: current.responseRevision ?? 0 };
    }
    await transaction.insert(recruitingCommandReceipts).values({ id: randomUUID(), actorPrincipalId: principal, scope, keyHash, requestHash, bodyDigestHex: metadata.requestHashHex, createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
    return { replayed: false as const, principal, keyHash };
  }

  private async finishAdminReceipt(transaction: V2Transaction, principal: string, scope: string, keyHash: Buffer, body: Record<string, unknown>, revision: number, status: 200 | 201) {
    await transaction.update(recruitingCommandReceipts).set({ responseStatus: status, responseJson: body, responseRevision: revision }).where(and(eq(recruitingCommandReceipts.actorPrincipalId, principal), eq(recruitingCommandReceipts.scope, scope), eq(recruitingCommandReceipts.keyHash, keyHash)));
  }

  private async installation(transaction: V2Transaction, publicId: string, now: Date, keyId = "legacy", botVersion?: string) {
    if (!isKakaoFingerprint(publicId, "install") || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u.test(keyId) || (botVersion !== undefined && !/^[A-Za-z0-9][A-Za-z0-9:._-]{7,127}$/u.test(botVersion))) throw new KakaoRoomRegistryError("INVALID_INPUT");
    let row = (await transaction.select().from(kakaoBotInstallations).where(eq(kakaoBotInstallations.publicId, publicId)).for("update").limit(1))[0];
    if (!row) {
      const id = randomUUID();
      await transaction.insert(kakaoBotInstallations).values({ id, publicId, displayName: `봇 설치본 ${publicId.slice(-6)}`, keyId, lastBotVersion: botVersion ?? null, firstSeenAt: now, lastSeenAt: now });
      row = (await transaction.select().from(kakaoBotInstallations).where(eq(kakaoBotInstallations.id, id)).limit(1))[0];
    } else {
      const currentKeyId = process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT ?? "current";
      const previousKeyId = process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS;
      const mayBindLegacy = row.keyId === "legacy";
      const mayPromoteRotation = Boolean(previousKeyId && row.keyId === previousKeyId && keyId === currentKeyId);
      if (row.keyId !== keyId && !mayBindLegacy && !mayPromoteRotation) throw new KakaoRoomRegistryError("INSTALLATION_KEY_MISMATCH");
      await transaction.update(kakaoBotInstallations).set({ keyId: mayBindLegacy || mayPromoteRotation ? keyId : row.keyId, lastBotVersion: botVersion ?? row.lastBotVersion, lastSeenAt: now }).where(eq(kakaoBotInstallations.id, row.id));
    }
    if (!row) throw new KakaoRoomRegistryError("ROOM_BINDING_REQUIRED");
    if (row.status !== "ACTIVE") throw new KakaoRoomRegistryError("INSTALLATION_REVOKED");
    return row;
  }

  /** Emergency/bootstrap only. Legacy aggregate scopes are moved to one explicit canonical room; rooms are never merged or deleted. */
  private async bootstrap(transaction: V2Transaction, installationId: string, now: Date, environment: KakaoRoomBootstrapEnvironment) {
    const rooms = [...new Set((environment.KAKAO_WEBHOOK_ALLOWED_ROOMS ?? "").split(",").map((value) => value.trim()).filter((value) => isKakaoFingerprint(value, "room")))];
    const senders = [...new Set((environment.KAKAO_WEBHOOK_ALLOWED_SENDERS ?? "").split(",").map((value) => value.trim()).filter((value) => isKakaoFingerprint(value, "sender")))];
    if (rooms.length !== 1) throw new KakaoRoomRegistryError("INVALID_INPUT");
    const legacyRoomFingerprint = rooms[0]!;
    const installation = (await transaction.select().from(kakaoBotInstallations).where(eq(kakaoBotInstallations.id, installationId)).for("update").limit(1))[0];
    if (!installation) throw new KakaoRoomRegistryError("UNAVAILABLE");
    const prior = (await transaction.select().from(kakaoRoomBindings).where(eq(kakaoRoomBindings.localRoomFingerprint, legacyRoomFingerprint)).limit(1))[0];
    let roomId = installation.canonicalRoomId ?? prior?.roomId;
    if (!roomId) {
      roomId = randomUUID();
      await transaction.insert(kakaoRooms).values({ id: roomId, displayName: `Bootstrap ${legacyRoomFingerprint.slice(-6)}`, status: "ACTIVE", registrationSource: "BOOTSTRAP", registeredAt: now, updatedAt: now });
    }
    if (installation.canonicalRoomId && installation.canonicalRoomId !== roomId) throw new KakaoRoomRegistryError("CONFLICT");
    await transaction.update(kakaoBotInstallations).set({ canonicalRoomId: roomId, revision: sql`${kakaoBotInstallations.revision} + 1`, lastSeenAt: now }).where(eq(kakaoBotInstallations.id, installation.id));
    await transaction.update(recruitParties).set({ sourceRoomId: roomId }).where(eq(recruitParties.sourceRoomId, legacyRoomFingerprint));
    await transaction.update(scrimRecruits).set({ sourceRoomId: roomId }).where(eq(scrimRecruits.sourceRoomId, legacyRoomFingerprint));
    await transaction.update(operationForms).set({ sourceRoomId: roomId }).where(eq(operationForms.sourceRoomId, legacyRoomFingerprint));
    for (const senderFingerprint of senders) await transaction.insert(kakaoRoomMembers).values({ id: randomUUID(), roomId, senderFingerprint, role: "ADMIN", lastActivityAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: [kakaoRoomMembers.roomId, kakaoRoomMembers.senderFingerprint] });
  }

  /**
   * Explicit one-shot import for emergency recovery or legacy cutover. Normal
   * request authorization never reads the static room/sender environment.
   */
  async bootstrapFromEnvironment(installationPublicId: string, environment: KakaoRoomBootstrapEnvironment) {
    return withTransaction(this.database, async (transaction) => {
      const now = new Date();
      const installation = await this.installation(transaction, installationPublicId, now);
      await this.bootstrap(transaction, installation.id, now, environment);
      return Object.freeze({ installationId: installation.id });
    });
  }

  async authorize(input: Readonly<{ installationPublicId: string; senderFingerprint: string; requiredRole: KakaoRoomMemberRole; keyId?: string; botVersion?: string }>): Promise<KakaoRoomAuthorization> {
    if (!isKakaoFingerprint(input.senderFingerprint, "sender")) throw new KakaoRoomRegistryError("INVALID_INPUT");
    const result = await withTransaction(this.database, async (transaction) => {
      const now = new Date(); const installation = await this.installation(transaction, input.installationPublicId, now, input.keyId, input.botVersion);
      if (!installation.canonicalRoomId) return Object.freeze({ failure: "ROOM_BINDING_REQUIRED" as const });
      const room = (await transaction.select().from(kakaoRooms).where(eq(kakaoRooms.id, installation.canonicalRoomId)).for("update").limit(1))[0];
      if (!room || room.status === "REVOKED") throw new KakaoRoomRegistryError("ROOM_NOT_REGISTERED");
      if (room.status === "PAUSED") throw new KakaoRoomRegistryError("ROOM_PAUSED");
      let member = (await transaction.select().from(kakaoRoomMembers).where(and(eq(kakaoRoomMembers.roomId, room.id), eq(kakaoRoomMembers.senderFingerprint, input.senderFingerprint))).for("update").limit(1))[0];
      if (!member) {
        const id = randomUUID();
        await transaction.insert(kakaoRoomMembers).values({ id, roomId: room.id, senderFingerprint: input.senderFingerprint, role: "MEMBER", lastActivityAt: now, createdAt: now, updatedAt: now });
        member = (await transaction.select().from(kakaoRoomMembers).where(eq(kakaoRoomMembers.id, id)).limit(1))[0];
      } else await transaction.update(kakaoRoomMembers).set({ lastActivityAt: now, updatedAt: now }).where(eq(kakaoRoomMembers.id, member.id));
      if (!member) throw new KakaoRoomRegistryError("UNAVAILABLE");
      let effectiveRole = member.role;
      if (!isStableKakaoSenderFingerprint(input.senderFingerprint)) effectiveRole = "MEMBER";
      if (member.linkedUserAccountId) {
        const account = (await transaction.select({ role: userAccounts.role, status: userAccounts.status }).from(userAccounts).where(eq(userAccounts.id, member.linkedUserAccountId)).limit(1))[0];
        if (account?.status === "APPROVED" && (account.role === "ADMIN" || account.role === "SUPER_ADMIN") && roleRank(effectiveRole) < roleRank("ADMIN")) effectiveRole = "ADMIN";
      }
      if (!kakaoRoleAtLeast(effectiveRole, input.requiredRole)) throw new KakaoRoomRegistryError("ROLE_FORBIDDEN");
      return Object.freeze({ roomId: room.id, roomStatus: "ACTIVE" as const, installationId: installation.id, memberId: member.id, role: effectiveRole });
    });
    if ("failure" in result) throw new KakaoRoomRegistryError(result.failure);
    return result;
  }

  async list() {
    const [rooms, bindings, installations, members] = await Promise.all([this.database.select().from(kakaoRooms).orderBy(kakaoRooms.displayName, kakaoRooms.id), this.database.select().from(kakaoRoomBindings).orderBy(kakaoRoomBindings.roomId, kakaoRoomBindings.createdAt), this.database.select().from(kakaoBotInstallations), this.database.select().from(kakaoRoomMembers).orderBy(kakaoRoomMembers.roomId, kakaoRoomMembers.createdAt)]);
    return Object.freeze({ rooms: rooms.map((room) => Object.freeze({ id: room.id, revision: room.revision, displayName: room.displayName, status: room.status, registrationSource: room.registrationSource, policyVersion: room.policyVersion, registeredAt: room.registeredAt.toISOString(), updatedAt: room.updatedAt.toISOString(), bindings: installations.filter((installation) => installation.canonicalRoomId === room.id).map((installation) => { const legacy = bindings.find((binding) => binding.installationId === installation.id && binding.roomId === room.id); return Object.freeze({ id: installation.id, installationHint: hint(installation.publicId), installationKeyId: installation.keyId, installationStatus: installation.status, lastBotVersion: installation.lastBotVersion, lastSeenAt: installation.lastSeenAt.toISOString(), roomHint: "설치본 기준", source: legacy?.registrationSource ?? room.registrationSource }); }), members: members.filter((member) => member.roomId === room.id).map((member) => Object.freeze({ id: member.id, revision: member.revision, senderHint: hint(member.senderFingerprint), role: member.role, linkedUserAccountId: member.linkedUserAccountId, linkedPlayerId: member.linkedPlayerId, lastActivityAt: member.lastActivityAt.toISOString() })) })) });
  }

  async createPairing(input: Readonly<{ actor: OperationsActor; targetRoomId?: string | null; displayName: string; ttlMinutes: number; metadata: OperationsCommandMetadata }>) {
    if (input.displayName.trim().length < 1 || input.displayName.trim().length > 120 || !Number.isSafeInteger(input.ttlMinutes) || input.ttlMinutes < 1 || input.ttlMinutes > 30) throw new KakaoRoomRegistryError("INVALID_INPUT");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = randomBytes(8); let code = ""; for (let index = 0; index < 8; index += 1) code += alphabet[bytes[index]! % alphabet.length];
    return withTransaction(this.database, async (transaction) => {
      const actor = await this.requireSuper(transaction, input.actor); const receipt = await this.claimAdminReceipt(transaction, actor.id, "admin:kakao-room:pairing:create", input.metadata);
      if (receipt.replayed) return Object.freeze({ id: String(receipt.body.id), code: null, expiresAt: String(receipt.body.expiresAt), replayed: true as const });
      const now = new Date(); const id = randomUUID();
      if (input.targetRoomId && !(await transaction.select({ id: kakaoRooms.id }).from(kakaoRooms).where(eq(kakaoRooms.id, input.targetRoomId)).limit(1))[0]) throw new KakaoRoomRegistryError("ROOM_NOT_REGISTERED");
      await transaction.insert(kakaoRoomPairings).values({ id, targetRoomId: input.targetRoomId ?? null, displayName: input.displayName.trim(), codeHash: pairingHash(code), expiresAt: new Date(now.getTime() + input.ttlMinutes * 60_000), createdByUserAccountId: actor.id, createdAt: now });
      const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000).toISOString();
      await transaction.insert(auditEvents).values({ requestId: input.metadata.requestId, actorUserAccountId: actor.id, action: "KAKAO_ROOM_PAIRING_CREATED", targetType: "KAKAO_ROOM_PAIRING", targetId: id, metadataJson: { targetRoomId: input.targetRoomId ?? null, ttlMinutes: input.ttlMinutes }, createdAt: now });
      await this.finishAdminReceipt(transaction, receipt.principal, "admin:kakao-room:pairing:create", receipt.keyHash, { id, expiresAt }, 0, 201);
      return Object.freeze({ id, code, expiresAt, replayed: false as const });
    });
  }

  async consumePairing(input: Readonly<{ installationPublicId: string; senderFingerprint: string; keyId?: string; botVersion?: string; nonce: string; bodyDigestHex: string; code: unknown; requestKey: string; requestId: string }>) {
    const code = parsePairingCode(input.code);
    if (!code || !isKakaoFingerprint(input.senderFingerprint, "sender") || !/^[A-Za-z0-9_-]{16,100}$/u.test(input.nonce) || !/^[a-f0-9]{64}$/u.test(input.bodyDigestHex)) throw new KakaoRoomRegistryError("INVALID_INPUT");
    return withTransaction(this.database, async (transaction) => {
      const now = new Date(); const installation = await this.installation(transaction, input.installationPublicId, now, input.keyId, input.botVersion);
      const actorPrincipalId = `bot:kakao:${input.installationPublicId}`;
      const nonceHash = createHash("sha256").update(`klol-v2:recruiting-nonce:v1\0${actorPrincipalId}\0${input.nonce}`).digest();
      const bindingHash = createHash("sha256").update(["klol-v2:kakao-pairing-nonce-binding:v1", input.installationPublicId, input.senderFingerprint, input.requestKey, input.bodyDigestHex].join("\0")).digest();
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actorPrincipalId}:${nonceHash.toString("hex")}`}, 0))`);
      const priorNonce = (await transaction.select().from(recruitingNonceBindings).where(and(eq(recruitingNonceBindings.actorPrincipalId, actorPrincipalId), eq(recruitingNonceBindings.nonceHash, nonceHash))).limit(1))[0];
      if (priorNonce && priorNonce.expiresAt > now && !Buffer.from(priorNonce.bindingHash).equals(bindingHash)) throw new KakaoRoomRegistryError("CONFLICT");
      const nonceValues = { actorKind: "BOT" as const, actorPrincipalId, nonceHash, bindingHash, keyId: input.keyId ?? "legacy", createdAt: now, expiresAt: new Date(now.getTime() + 10 * 60_000) };
      if (!priorNonce) await transaction.insert(recruitingNonceBindings).values({ id: randomUUID(), ...nonceValues });
      else if (priorNonce.expiresAt <= now) await transaction.update(recruitingNonceBindings).set(nonceValues).where(eq(recruitingNonceBindings.id, priorNonce.id));
      const pairing = (await transaction.select().from(kakaoRoomPairings).where(eq(kakaoRoomPairings.codeHash, pairingHash(code))).for("update").limit(1))[0];
      if (!pairing) throw new KakaoRoomRegistryError("INVALID_INPUT");
      const requestKeyHash = pairingRequestKeyHash(input.requestKey);
      if (pairing.consumedAt) {
        if (pairing.consumedRoomId && pairing.consumedInstallationId === installation.id && pairing.consumedSenderFingerprint === input.senderFingerprint && pairing.consumedRequestKeyHash && Buffer.from(pairing.consumedRequestKeyHash).equals(requestKeyHash)) return Object.freeze({ roomId: pairing.consumedRoomId, status: "ACTIVE" as const, role: isStableKakaoSenderFingerprint(input.senderFingerprint) ? "MANAGER" as const : "MEMBER" as const, replayed: true as const });
        throw new KakaoRoomRegistryError("PAIRING_REPLAY");
      }
      if (pairing.expiresAt <= now) throw new KakaoRoomRegistryError("PAIRING_EXPIRED");
      if (installation.canonicalRoomId && pairing.targetRoomId && installation.canonicalRoomId !== pairing.targetRoomId) throw new KakaoRoomRegistryError("CONFLICT");
      let roomId = pairing.targetRoomId ?? installation.canonicalRoomId;
      if (!roomId) { roomId = randomUUID(); await transaction.insert(kakaoRooms).values({ id: roomId, displayName: pairing.displayName, status: "ACTIVE", registrationSource: "PAIRING", policyVersion: 1, registeredByUserAccountId: pairing.createdByUserAccountId, registeredAt: now, updatedAt: now }); }
      await transaction.update(kakaoBotInstallations).set({ canonicalRoomId: roomId, revision: sql`${kakaoBotInstallations.revision} + 1`, lastSeenAt: now }).where(eq(kakaoBotInstallations.id, installation.id));
      const pairedRole = isStableKakaoSenderFingerprint(input.senderFingerprint) ? "MANAGER" as const : "MEMBER" as const;
      await transaction.insert(kakaoRoomMembers).values({ id: randomUUID(), roomId, senderFingerprint: input.senderFingerprint, role: pairedRole, lastActivityAt: now, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [kakaoRoomMembers.roomId, kakaoRoomMembers.senderFingerprint], set: { role: pairedRole, lastActivityAt: now, revision: sql`${kakaoRoomMembers.revision} + 1`, updatedAt: now } });
      await transaction.update(kakaoRoomPairings).set({ consumedAt: now, consumedRoomId: roomId, consumedInstallationId: installation.id, consumedLocalRoomFingerprint: input.installationPublicId, consumedSenderFingerprint: input.senderFingerprint, consumedRequestKeyHash: requestKeyHash }).where(and(eq(kakaoRoomPairings.id, pairing.id), isNull(kakaoRoomPairings.consumedAt)));
      await transaction.insert(auditEvents).values({ requestId: input.requestId, actorUserAccountId: pairing.createdByUserAccountId, action: "KAKAO_ROOM_PAIRED", targetType: "KAKAO_ROOM", targetId: roomId, metadataJson: { installationHint: hint(input.installationPublicId), scope: "INSTALLATION" }, createdAt: now });
      return Object.freeze({ roomId, status: "ACTIVE" as const, role: pairedRole, replayed: false as const });
    });
  }

  async setRoomStatus(input: Readonly<{ actor: OperationsActor; roomId: string; status: KakaoRoomStatus; metadata: OperationsCommandMetadata }>) {
    return withTransaction(this.database, async (transaction) => { const actor = await this.requireSuper(transaction, input.actor); const receipt = await this.claimAdminReceipt(transaction, actor.id, "admin:kakao-room:status", input.metadata); if (receipt.replayed) return Object.freeze({ ...(receipt.body as { id: string; revision: number; status: KakaoRoomStatus }), replayed: true as const }); const now = new Date(); const row = (await transaction.select().from(kakaoRooms).where(eq(kakaoRooms.id, input.roomId)).for("update").limit(1))[0]; if (!row) throw new KakaoRoomRegistryError("ROOM_NOT_REGISTERED"); if (row.revision !== input.metadata.expectedRevision) throw new KakaoRoomRegistryError("PRECONDITION_FAILED"); const body = { id: row.id, revision: row.revision + 1, status: input.status }; await transaction.update(kakaoRooms).set({ status: input.status, revision: row.revision + 1, policyVersion: row.policyVersion + 1, updatedAt: now }).where(eq(kakaoRooms.id, row.id)); await transaction.insert(auditEvents).values({ requestId: input.metadata.requestId, actorUserAccountId: actor.id, action: "KAKAO_ROOM_STATUS_CHANGED", targetType: "KAKAO_ROOM", targetId: row.id, beforeJson: { status: row.status }, afterJson: { status: input.status }, metadataJson: { policyVersion: row.policyVersion + 1 }, createdAt: now }); await this.finishAdminReceipt(transaction, receipt.principal, "admin:kakao-room:status", receipt.keyHash, body, body.revision, 200); return Object.freeze({ ...body, replayed: false as const }); });
  }

  async setMemberRole(input: Readonly<{ actor: OperationsActor; memberId: string; role: KakaoRoomMemberRole; metadata: OperationsCommandMetadata }>) {
    return withTransaction(this.database, async (transaction) => { const actor = await this.requireSuper(transaction, input.actor); const receipt = await this.claimAdminReceipt(transaction, actor.id, "admin:kakao-room:member-role", input.metadata); if (receipt.replayed) return Object.freeze({ ...(receipt.body as { id: string; revision: number; role: KakaoRoomMemberRole }), replayed: true as const }); const now = new Date(); const row = (await transaction.select().from(kakaoRoomMembers).where(eq(kakaoRoomMembers.id, input.memberId)).for("update").limit(1))[0]; if (!row) throw new KakaoRoomRegistryError("ROOM_NOT_REGISTERED"); if (row.revision !== input.metadata.expectedRevision) throw new KakaoRoomRegistryError("PRECONDITION_FAILED"); const body = { id: row.id, revision: row.revision + 1, role: input.role }; await transaction.update(kakaoRoomMembers).set({ role: input.role, revision: row.revision + 1, updatedAt: now }).where(eq(kakaoRoomMembers.id, row.id)); await transaction.update(kakaoRooms).set({ policyVersion: sql`${kakaoRooms.policyVersion} + 1`, updatedAt: now }).where(eq(kakaoRooms.id, row.roomId)); await transaction.insert(auditEvents).values({ requestId: input.metadata.requestId, actorUserAccountId: actor.id, action: "KAKAO_ROOM_MEMBER_ROLE_CHANGED", targetType: "KAKAO_ROOM_MEMBER", targetId: row.id, beforeJson: { role: row.role }, afterJson: { role: input.role }, createdAt: now }); await this.finishAdminReceipt(transaction, receipt.principal, "admin:kakao-room:member-role", receipt.keyHash, body, body.revision, 200); return Object.freeze({ ...body, replayed: false as const }); });
  }

  private async requireSuper(transaction: V2Transaction, actor: OperationsActor) {
    const locked = await lockTransactionSessionActor(transaction, actor.session, new Date(), { ...ADMIN_MUTATION_SESSION_POLICY, minimumRole: "SUPER_ADMIN" });
    if (!locked || locked.role !== "SUPER_ADMIN") throw new KakaoRoomRegistryError("SESSION_STALE");
    return locked;
  }
}
