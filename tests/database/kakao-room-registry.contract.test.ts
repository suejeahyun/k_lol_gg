import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";

import { PostgresKakaoRoomRegistry, KakaoRoomRegistryError } from "../../src/modules/recruiting/kakao-access/postgres-kakao-room-registry";
import type { OperationsActor } from "../../src/modules/operations/application/ports";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { authSessions, kakaoBotInstallations, recruitParties, userAccounts } from "../../src/platform/db/schema";

const installationA = `install-${"a".repeat(32)}`;
const installationB = `install-${"b".repeat(32)}`;
const installationC = `install-${"c".repeat(32)}`;
const installationD = `install-${"d".repeat(32)}`;
const roomA = `room-${"1".repeat(32)}`;
const roomB = `room-${"2".repeat(32)}`;
const senderA = `sender-${"3".repeat(32)}`;
const senderB = `sender-${"4".repeat(32)}`;
const senderC = `sender-${"5".repeat(32)}`;
let requestSequence = 0;
function metadata(expectedRevision = 0) { requestSequence += 1; return { requestId: randomUUID(), requestKey: `kakao-room-contract-${requestSequence}-12345678`, requestHashHex: randomBytes(32).toString("hex"), expectedRevision }; }

test("different MessengerBot installations bind local fingerprints to one canonical room without role leakage", { concurrency: false }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL; assert.ok(connectionString);
  const priorRooms = process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS; const priorSenders = process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS;
  const priorCurrentKeyId = process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT; const priorPreviousKeyId = process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS;
  delete process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS; delete process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS;
  const { database, pool } = createDatabaseHandle(connectionString, { max: 3 });
  const superId = randomUUID(); const sessionId = randomUUID(); const now = new Date();
  const actor: OperationsActor = { session: { userAccountId: superId, sessionId, role: "SUPER_ADMIN", authVersion: 0 }, role: "SUPER_ADMIN", accountStatus: "APPROVED" };
  const registry = new PostgresKakaoRoomRegistry(database);
  try {
    await applyMigrations(database);
    await database.insert(userAccounts).values({ id: superId, loginId: `room-super-${superId}`, loginIdNormalized: `room-super-${superId}`, role: "SUPER_ADMIN", status: "APPROVED" });
    await database.insert(authSessions).values({ id: sessionId, tokenHash: randomBytes(32), userAccountId: superId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 3_600_000) });

    const firstMetadata = metadata();
    const firstCode = await registry.createPairing({ actor, displayName: "동일 실제 방", ttlMinutes: 10, metadata: firstMetadata });
    const pairingReplay = await registry.createPairing({ actor, displayName: "동일 실제 방", ttlMinutes: 10, metadata: firstMetadata });
    assert.equal(pairingReplay.id, firstCode.id); assert.equal(pairingReplay.code, null); assert.equal(pairingReplay.replayed, true);
    const firstRequestKey = "pair-consume-first-12345678";
    const first = await registry.consumePairing({ installationPublicId: installationA, localRoomFingerprint: roomA, senderFingerprint: senderA, code: firstCode.code, requestKey: firstRequestKey, requestId: randomUUID() });
    assert.equal((await registry.consumePairing({ installationPublicId: installationA, localRoomFingerprint: roomA, senderFingerprint: senderA, code: firstCode.code, requestKey: firstRequestKey, requestId: randomUUID() })).replayed, true);
    const secondCode = await registry.createPairing({ actor, targetRoomId: first.roomId, displayName: "동일 실제 방", ttlMinutes: 10, metadata: metadata() });
    const second = await registry.consumePairing({ installationPublicId: installationB, localRoomFingerprint: roomB, senderFingerprint: senderB, code: secondCode.code, requestKey: "pair-consume-second-12345678", requestId: randomUUID() });
    assert.equal(second.roomId, first.roomId);
    assert.equal((await registry.authorize({ installationPublicId: installationA, localRoomFingerprint: roomA, senderFingerprint: senderA, requiredRole: "MEMBER" })).roomId, first.roomId);
    const authorizedB = await registry.authorize({ installationPublicId: installationB, localRoomFingerprint: roomB, senderFingerprint: senderB, requiredRole: "MEMBER" });
    assert.equal(authorizedB.roomId, first.roomId);
    const authorizedC = await registry.authorize({ installationPublicId: installationA, localRoomFingerprint: roomA, senderFingerprint: senderC, requiredRole: "MEMBER" });
    assert.equal(authorizedC.roomId, first.roomId);
    assert.equal(authorizedC.role, "MEMBER");
    await assert.rejects(registry.authorize({ installationPublicId: installationA, localRoomFingerprint: roomA, senderFingerprint: senderC, requiredRole: "ADMIN" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROLE_FORBIDDEN");
    await assert.rejects(registry.authorize({ installationPublicId: installationC, localRoomFingerprint: roomA, senderFingerprint: senderA, requiredRole: "MEMBER" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROOM_BINDING_REQUIRED");
    await assert.rejects(registry.authorize({ installationPublicId: installationB, localRoomFingerprint: roomB, senderFingerprint: senderB, requiredRole: "ADMIN" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROLE_FORBIDDEN");
    const roleMetadata = metadata(0); const promoted = await registry.setMemberRole({ actor, memberId: authorizedB.memberId, role: "ADMIN", metadata: roleMetadata });
    assert.equal((await registry.setMemberRole({ actor, memberId: authorizedB.memberId, role: "ADMIN", metadata: roleMetadata })).replayed, true);
    assert.equal((await registry.authorize({ installationPublicId: installationB, localRoomFingerprint: roomB, senderFingerprint: senderB, requiredRole: "ADMIN" })).role, "ADMIN");
    const pauseMetadata = metadata(0); const paused = await registry.setRoomStatus({ actor, roomId: first.roomId, status: "PAUSED", metadata: pauseMetadata });
    assert.equal((await registry.setRoomStatus({ actor, roomId: first.roomId, status: "PAUSED", metadata: pauseMetadata })).replayed, true);
    await registry.setRoomStatus({ actor, roomId: first.roomId, status: "ACTIVE", metadata: metadata(paused.revision) });
    assert.equal(promoted.role, "ADMIN");
    await assert.rejects(registry.consumePairing({ installationPublicId: installationA, localRoomFingerprint: roomA, senderFingerprint: senderA, code: firstCode.code, requestKey: "pair-consume-replay-87654321", requestId: randomUUID() }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "PAIRING_REPLAY");

    const otherCode = await registry.createPairing({ actor, displayName: "다른 실제 방", ttlMinutes: 10, metadata: metadata() });
    const other = await registry.consumePairing({ installationPublicId: installationC, localRoomFingerprint: roomB, senderFingerprint: senderB, code: otherCode.code, requestKey: "pair-consume-other-12345678", requestId: randomUUID() });
    assert.notEqual(other.roomId, first.roomId);
    const mergeCode = await registry.createPairing({ actor, targetRoomId: first.roomId, displayName: "동일 실제 방", ttlMinutes: 10, metadata: metadata() });
    await assert.rejects(registry.consumePairing({ installationPublicId: installationC, localRoomFingerprint: roomB, senderFingerprint: senderB, code: mergeCode.code, requestKey: "pair-consume-conflict-12345678", requestId: randomUUID() }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "CONFLICT");

    const keyedCode = await registry.createPairing({ actor, displayName: "설치본 키 고정 방", ttlMinutes: 10, metadata: metadata() });
    const keyed = await registry.consumePairing({ installationPublicId: installationD, localRoomFingerprint: roomA, senderFingerprint: senderA, keyId: "phone-key-a", botVersion: "KLOL_V41_V3_R14", code: keyedCode.code, requestKey: "pair-keyed-install-12345678", requestId: randomUUID() });
    assert.equal((await registry.authorize({ installationPublicId: installationD, localRoomFingerprint: roomA, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-a", botVersion: "KLOL_V41_V3_R14" })).roomId, keyed.roomId);
    await assert.rejects(registry.authorize({ installationPublicId: installationD, localRoomFingerprint: roomA, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-b", botVersion: "KLOL_V41_V3_R14" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "INSTALLATION_KEY_MISMATCH");
    process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS = "phone-key-a"; process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = "phone-key-b";
    assert.equal((await registry.authorize({ installationPublicId: installationD, localRoomFingerprint: roomA, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-b", botVersion: "KLOL_V41_V3_R14_ROTATED" })).roomId, keyed.roomId);
    await assert.rejects(registry.authorize({ installationPublicId: installationD, localRoomFingerprint: roomA, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-a", botVersion: "KLOL_V41_V3_R14" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "INSTALLATION_KEY_MISMATCH");
    const keyedBinding = (await registry.list()).rooms.find((room) => room.id === keyed.roomId)?.bindings[0];
    assert.equal(keyedBinding?.installationKeyId, "phone-key-b");
    assert.equal(keyedBinding?.lastBotVersion, "KLOL_V41_V3_R14_ROTATED");
    await database.update(kakaoBotInstallations).set({ status: "REVOKED" }).where(eq(kakaoBotInstallations.publicId, installationD));
    await assert.rejects(registry.authorize({ installationPublicId: installationD, localRoomFingerprint: roomA, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-b", botVersion: "KLOL_V41_V3_R14_ROTATED" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "INSTALLATION_REVOKED");

    const bootstrapRoom = `room-${"f".repeat(32)}`; process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS = bootstrapRoom; process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = senderA;
    const beforeMismatchedEnvironment = await registry.list();
    await assert.rejects(registry.authorize({ installationPublicId: installationA, localRoomFingerprint: bootstrapRoom, senderFingerprint: senderA, requiredRole: "MEMBER" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROOM_BINDING_REQUIRED");
    const afterMismatchedEnvironment = await registry.list();
    assert.deepEqual(afterMismatchedEnvironment.rooms.map((room) => ({ id: room.id, status: room.status, bindings: room.bindings.map((binding) => binding.id) })), beforeMismatchedEnvironment.rooms.map((room) => ({ id: room.id, status: room.status, bindings: room.bindings.map((binding) => binding.id) })));
    const legacyPartyId = randomUUID(); await database.insert(recruitParties).values({ id: legacyPartyId, recruitDate: "2026-09-09", resetSequence: 99, recruitNumber: 99, type: "ARAM", status: "IN_PROGRESS", title: "기존 방 이관", maximumMembers: 5, membersJson: [], sourceRoomId: bootstrapRoom, lastActivityAt: now });
    await registry.bootstrapFromEnvironment(installationA, { KAKAO_WEBHOOK_ALLOWED_ROOMS: bootstrapRoom, KAKAO_WEBHOOK_ALLOWED_SENDERS: senderA });
    const bootstrapped = await registry.authorize({ installationPublicId: installationA, localRoomFingerprint: bootstrapRoom, senderFingerprint: senderA, requiredRole: "ADMIN" });
    assert.equal((await database.select({ sourceRoomId: recruitParties.sourceRoomId }).from(recruitParties).where(eq(recruitParties.id, legacyPartyId)))[0]?.sourceRoomId, bootstrapped.roomId);
  } finally {
    if (priorRooms === undefined) delete process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS; else process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS = priorRooms;
    if (priorSenders === undefined) delete process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS; else process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = priorSenders;
    if (priorCurrentKeyId === undefined) delete process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT; else process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = priorCurrentKeyId;
    if (priorPreviousKeyId === undefined) delete process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS; else process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS = priorPreviousKeyId;
    await pool.end();
  }
});
