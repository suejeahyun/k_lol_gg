import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { and, count, eq } from "drizzle-orm";
import sharp from "sharp";

import { PrivateAssetService } from "../../src/modules/assets/application/private-asset-service";
import { PrivateAssetError } from "../../src/modules/assets/domain/private-asset";
import { DisciplineCommandHandler } from "../../src/modules/discipline/application/command-handler";
import { disciplineCommandRequestHash, hashDisciplineRequestKey, type DisciplineCommand } from "../../src/modules/discipline/application/commands";
import type { DisciplineMutationEnvelope } from "../../src/modules/discipline/application/ports";
import { DisciplineAssetInspector, DisabledPrivateAssetReadGrant, disciplineAssetStorageKeys, randomAssetIdentity } from "../../src/modules/discipline/infrastructure/discipline-private-assets";
import { PostgresDisciplineAdapter } from "../../src/modules/discipline/infrastructure/postgres-discipline-adapter";
import { FakePrivateImageStorage } from "../../src/modules/matches/infrastructure/private-image";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { auditEvents, authSessions, disciplineCommandReceipts, disciplineEvidence, disciplineOutbox, disciplineRecords, privateAssets, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest(); }
function envelope(actorSession: DisciplineMutationEnvelope["actorSession"], label: string, body: unknown): DisciplineMutationEnvelope {
  return { actorSession, requestId: randomUUID(), scope: `admin:discipline:record:${label}`, keyHash: createHash("sha256").update(`key:${label}`).digest(), requestHash: digest(body) };
}
function sealedCommand(input: Readonly<{ type: DisciplineCommand["type"]; taskId: string; expectedRevision: number; principalId: string; sessionId: string; authVersion: number; role: "USER" | "SUPER_ADMIN"; bodyDigestHex: string; key: string; payload: DisciplineCommand["payload"] }>): DisciplineCommand {
  const admin = input.type === "REVIEW_EVIDENCE";
  const command = { type: input.type, taskId: input.taskId, metadata: { principalId: input.principalId, requestId: randomUUID(), expectedRevision: input.expectedRevision, issuedAt: new Date().toISOString(), authorizationIntent: admin ? { kind: "ADMIN_TOTP" as const, sessionId: input.sessionId, minimumRole: "SUPER_ADMIN" as const, authVersion: input.authVersion, requireTotp: true as const, transactionRecheck: true as const } : { kind: "ACCOUNT_SESSION" as const, sessionId: input.sessionId, role: input.role, authVersion: input.authVersion, transactionRecheck: true as const }, idempotency: { scope: admin ? "admin:discipline:evidence:review" : "account:discipline:evidence:submit", keyHash: hashDisciplineRequestKey(input.key), requestHash: new Uint8Array(32), bodyDigestHex: input.bodyDigestHex } }, payload: input.payload } as DisciplineCommand;
  (command.metadata.idempotency as { requestHash: Uint8Array }).requestHash = disciplineCommandRequestHash(command);
  return command;
}

test("S11 discipline records and private evidence persist with masked ownership, replay, and exact review state", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString);
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  const adapter = new PostgresDisciplineAdapter(database);
  const storage = new FakePrivateImageStorage();
  const assets = new PrivateAssetService({ unitOfWork: adapter, repository: adapter, authorization: adapter, audit: adapter.assetAuditPort(), inspection: new DisciplineAssetInspector(), storage, readGrants: new DisabledPrivateAssetReadGrant(), assetIds: randomAssetIdentity, eventIds: randomAssetIdentity, storageKeys: disciplineAssetStorageKeys, clock: { now: () => new Date().toISOString() } });
  const handler = new DisciplineCommandHandler({ unitOfWork: adapter, repository: adapter, authorization: adapter, receipts: adapter, audit: adapter.auditPort(), outbox: adapter.outboxPort(), clock: { now: () => new Date(), receiptExpiresAt: (value) => new Date(value.getTime() + 86_400_000) } });
  const adminId = randomUUID(); const ownerId = randomUUID(); const otherId = randomUUID();
  const adminSessionId = randomUUID(); const ownerSessionId = randomUUID(); const otherSessionId = randomUUID();
  const now = new Date(); const expiresAt = new Date(now.getTime() + 3_600_000);
  const adminSession = { userAccountId: adminId, sessionId: adminSessionId, role: "SUPER_ADMIN", authVersion: 0 } as const;
  const ownerActor = { userAccountId: ownerId, sessionId: ownerSessionId, authVersion: 0, purpose: "ACCOUNT", role: "USER", approvalStatus: "APPROVED" } as const;
  const otherActor = { userAccountId: otherId, sessionId: otherSessionId, authVersion: 0, purpose: "ACCOUNT", role: "USER", approvalStatus: "APPROVED" } as const;
  const adminAssetActor = { userAccountId: adminId, sessionId: adminSessionId, authVersion: 0, purpose: "ADMIN", role: "SUPER_ADMIN", approvalStatus: "APPROVED" } as const;
  try {
    await applyMigrations(database); await applyMigrations(database);
    const tables = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='discipline'");
    assert.deepEqual(new Set(tables.rows.map((row) => row.table_name)), new Set(["asset_bindings", "asset_cleanup_outcomes", "ban_reviews", "caution_conversions", "command_receipts", "evidence", "outbox", "records", "resolution_tasks"]));
    const enums = await pool.query<{ typname: string }>("select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='discipline' and t.typtype='e'");
    assert.deepEqual(new Set(enums.rows.map((row) => row.typname)), new Set(["ban_review_status", "discipline_category", "discipline_type", "outbox_status", "task_status"]));
    assert.equal((await pool.query("select 1 from information_schema.tables where table_schema='riot' and table_name='account_links'")).rowCount, 1, "0014 survives before 0015");

    await database.insert(userAccounts).values([
      { id: adminId, loginId: "s11-super", loginIdNormalized: "s11-super", role: "SUPER_ADMIN", status: "APPROVED" },
      { id: ownerId, loginId: "s11-owner", loginIdNormalized: "s11-owner", status: "APPROVED" },
      { id: otherId, loginId: "s11-other", loginIdNormalized: "s11-other", status: "APPROVED" },
    ]);
    await database.insert(authSessions).values([
      { id: adminSessionId, tokenHash: randomBytes(32), userAccountId: adminId, authVersion: 0, role: "SUPER_ADMIN", purpose: "ADMIN", totpVerifiedAt: now, issuedAt: now, expiresAt },
      { id: ownerSessionId, tokenHash: randomBytes(32), userAccountId: ownerId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt },
      { id: otherSessionId, tokenHash: randomBytes(32), userAccountId: otherId, authVersion: 0, role: "USER", purpose: "ACCOUNT", issuedAt: now, expiresAt },
    ]);
    const createBody = { userAccountId: ownerId, playerId: null, targetName: "S11 대상", targetNickname: "하늘", targetTagLine: "S11", type: "WARNING" as const, category: "GENERAL" as const, source: "CONTRACT", reason: "계약 검증", internalNote: "비공개" };
    const createEnvelope = envelope(adminSession, "create", createBody);
    const created = await adapter.createRecord(createEnvelope, createBody, now);
    assert.equal(created.status, 201); assert.equal((await adapter.createRecord(createEnvelope, createBody, now)).replayed, true);
    const task = (await adapter.listOwnerTasks(ownerId))[0]; assert.ok(task); assert.equal(task.requiredGameCount, 10);
    assert.equal(JSON.stringify(task).includes("sha256"), false); assert.equal(JSON.stringify(task).includes("storageKey"), false);

    let revision = task.revision; let firstAssetId = "";
    for (let index = 0; index < task.requiredGameCount; index += 1) {
      const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: index * 13, g: 90, b: 180 } } }).png().toBuffer();
      const sha256Hex = createHash("sha256").update(bytes).digest("hex");
      const staged = await assets.stage({ actor: ownerActor, resourceType: "DISCIPLINE_TASK", resourceId: task.id, purpose: "DISCIPLINE_RESOLUTION", bytes, declaredContentType: "image/png", declaredSha256Hex: sha256Hex, originalFileName: `evidence-${index + 1}.png` });
      const ready = await assets.finalize(ownerActor, staged.assetId); firstAssetId ||= ready.assetId;
      const command = sealedCommand({ type: "SUBMIT_EVIDENCE", taskId: task.id, expectedRevision: revision, principalId: ownerId, sessionId: ownerSessionId, authVersion: 0, role: "USER", bodyDigestHex: sha256Hex, key: `s11-evidence-${String(index).padStart(4, "0")}`, payload: { privateAssetId: ready.assetId } });
      const submitted = await handler.handle(command); revision = submitted.revision;
      assert.equal((await handler.handle(command)).replayed, true);
      assert.equal(submitted.body.status, index === 9 ? "PENDING_REVIEW" : "AWAITING_UPLOAD");
    }
    await assert.rejects(assets.readPrivateBytes(otherActor, firstAssetId), (error: unknown) => error instanceof PrivateAssetError && error.code === "ASSET_NOT_AVAILABLE");
    assert.ok((await assets.readPrivateBytes(adminAssetActor, firstAssetId)).bytes.byteLength > 0);
    const reviewPayload = { decision: "APPROVE" as const, reviewNote: "확인 완료" };
    const reviewDigest = createHash("sha256").update(JSON.stringify(reviewPayload)).digest("hex");
    const approved = await handler.handle(sealedCommand({ type: "REVIEW_EVIDENCE", taskId: task.id, expectedRevision: revision, principalId: adminId, sessionId: adminSessionId, authVersion: 0, role: "SUPER_ADMIN", bodyDigestHex: reviewDigest, key: "s11-review-00000001", payload: reviewPayload }));
    assert.equal(approved.body.status, "APPROVED");
    const stats = await adapter.getPublicStatistics(); assert.equal(stats.activeWarningCount, 0); assert.equal(stats.resolvedCount, 1); assert.deepEqual(Object.keys(stats).sort(), ["activeBanCount", "activeCautionCount", "activeWarningCount", "resolvedCount", "updatedAt"]);
    assert.equal((await database.select().from(disciplineRecords).where(eq(disciplineRecords.active, false))).length, 1);
    assert.equal((await database.select({ value: count() }).from(privateAssets).where(and(
      eq(privateAssets.status, "READY"), eq(privateAssets.createdByUserAccountId, ownerId), eq(privateAssets.purpose, "DISCIPLINE_RESOLUTION"),
    )))[0]?.value, 10);
    assert.equal((await database.select({ value: count() }).from(disciplineEvidence))[0]?.value, 10);
    assert.ok((await database.select({ value: count() }).from(disciplineCommandReceipts))[0]!.value >= 12);
    assert.ok((await database.select({ value: count() }).from(disciplineOutbox))[0]!.value >= 12);
    assert.ok((await database.select({ value: count() }).from(auditEvents))[0]!.value >= 32);
  } finally { await pool.end(); }
});
