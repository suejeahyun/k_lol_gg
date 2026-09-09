import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
const senderA = `sender-${"3".repeat(32)}`;
const senderB = `sender-${"4".repeat(32)}`;
const senderC = `sender-${"5".repeat(32)}`;
const displaySender = `sender-display-${"6".repeat(32)}`;
let requestSequence = 0;

function metadata(expectedRevision = 0) {
  requestSequence += 1;
  return { requestId: randomUUID(), requestKey: `kakao-room-contract-${requestSequence}-12345678`, requestHashHex: randomBytes(32).toString("hex"), expectedRevision };
}

function pairInput(installationPublicId: string, senderFingerprint: string, code: string | null, requestKey: string, keyId?: string, botVersion?: string) {
  return {
    installationPublicId, senderFingerprint, keyId, botVersion,
    nonce: `nonce_${createHash("sha256").update(requestKey).digest("hex").slice(0, 32)}`,
    bodyDigestHex: createHash("sha256").update(String(code)).digest("hex"),
    code, requestKey, requestId: randomUUID(),
  };
}

test("one installation maps to exactly one canonical room without room parsing or sender allowlists", { concurrency: false }, async () => {
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

    await assert.rejects(registry.authorize({ installationPublicId: installationA, senderFingerprint: senderA, requiredRole: "MEMBER" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROOM_BINDING_REQUIRED");
    assert.equal((await database.select().from(kakaoBotInstallations).where(eq(kakaoBotInstallations.publicId, installationA))).length, 1);

    const firstCode = await registry.createPairing({ actor, displayName: "동일 실제 방", ttlMinutes: 10, metadata: metadata() });
    const firstRequest = pairInput(installationA, senderA, firstCode.code, "pair-consume-first-12345678");
    const first = await registry.consumePairing(firstRequest);
    assert.equal((await registry.consumePairing(firstRequest)).replayed, true);
    assert.equal((await registry.authorize({ installationPublicId: installationA, senderFingerprint: senderA, requiredRole: "MEMBER" })).roomId, first.roomId);

    const secondCode = await registry.createPairing({ actor, targetRoomId: first.roomId, displayName: "동일 실제 방", ttlMinutes: 10, metadata: metadata() });
    const second = await registry.consumePairing(pairInput(installationB, senderB, secondCode.code, "pair-consume-second-12345678"));
    assert.equal(second.roomId, first.roomId);
    const unknown = await registry.authorize({ installationPublicId: installationA, senderFingerprint: senderC, requiredRole: "MEMBER" });
    assert.equal(unknown.role, "MEMBER");
    await assert.rejects(registry.authorize({ installationPublicId: installationA, senderFingerprint: senderC, requiredRole: "ADMIN" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROLE_FORBIDDEN");

    const displayCode = await registry.createPairing({ actor, displayName: "표시명 fallback", ttlMinutes: 10, metadata: metadata() });
    const displayPairing = await registry.consumePairing(pairInput(installationC, displaySender, displayCode.code, "pair-display-12345678"));
    assert.equal(displayPairing.role, "MEMBER");
    await assert.rejects(registry.authorize({ installationPublicId: installationC, senderFingerprint: displaySender, requiredRole: "MANAGER" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "ROLE_FORBIDDEN");
    const conflictCode = await registry.createPairing({ actor, targetRoomId: first.roomId, displayName: "다른 방 금지", ttlMinutes: 10, metadata: metadata() });
    await assert.rejects(registry.consumePairing(pairInput(installationC, displaySender, conflictCode.code, "pair-conflict-12345678")), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "CONFLICT");

    const keyedCode = await registry.createPairing({ actor, displayName: "설치본 키 고정 방", ttlMinutes: 10, metadata: metadata() });
    const keyed = await registry.consumePairing(pairInput(installationD, senderA, keyedCode.code, "pair-keyed-12345678", "phone-key-a", "KLOL_V41_V3_R14_2"));
    process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS = "phone-key-a"; process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = "phone-key-b";
    assert.equal((await registry.authorize({ installationPublicId: installationD, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-b", botVersion: "KLOL_V41_V3_R14_2_ROTATED" })).roomId, keyed.roomId);
    await assert.rejects(registry.authorize({ installationPublicId: installationD, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-a", botVersion: "KLOL_V41_V3_R14_2" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "INSTALLATION_KEY_MISMATCH");
    await database.update(kakaoBotInstallations).set({ status: "REVOKED" }).where(eq(kakaoBotInstallations.publicId, installationD));
    await assert.rejects(registry.authorize({ installationPublicId: installationD, senderFingerprint: senderB, requiredRole: "MEMBER", keyId: "phone-key-b", botVersion: "KLOL_V41_V3_R14_2_ROTATED" }), (error: unknown) => error instanceof KakaoRoomRegistryError && error.code === "INSTALLATION_REVOKED");

    const bootstrapInstallation = `install-${"e".repeat(32)}`;
    const bootstrapRoom = `room-${"f".repeat(32)}`;
    const legacyPartyId = randomUUID();
    await database.insert(recruitParties).values({ id: legacyPartyId, recruitDate: "2026-09-09", resetSequence: 99, recruitNumber: 99, type: "ARAM", status: "IN_PROGRESS", title: "기존 방 이관", maximumMembers: 5, membersJson: [], sourceRoomId: bootstrapRoom, lastActivityAt: now });
    await registry.bootstrapFromEnvironment(bootstrapInstallation, { KAKAO_WEBHOOK_ALLOWED_ROOMS: bootstrapRoom, KAKAO_WEBHOOK_ALLOWED_SENDERS: senderA });
    const bootstrapped = await registry.authorize({ installationPublicId: bootstrapInstallation, senderFingerprint: senderA, requiredRole: "ADMIN" });
    assert.equal((await database.select({ sourceRoomId: recruitParties.sourceRoomId }).from(recruitParties).where(eq(recruitParties.id, legacyPartyId)))[0]?.sourceRoomId, bootstrapped.roomId);
  } finally {
    if (priorRooms === undefined) delete process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS; else process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS = priorRooms;
    if (priorSenders === undefined) delete process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS; else process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS = priorSenders;
    if (priorCurrentKeyId === undefined) delete process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT; else process.env.KAKAO_WEBHOOK_KEY_ID_CURRENT = priorCurrentKeyId;
    if (priorPreviousKeyId === undefined) delete process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS; else process.env.KAKAO_WEBHOOK_KEY_ID_PREVIOUS = priorPreviousKeyId;
    await pool.end();
  }
});
