import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { eq } from "drizzle-orm";

import type { AuthSession } from "../../src/modules/auth/domain/auth-session";
import { PostgresOperationForms, OperationFormApplicationError } from "../../src/modules/recruiting/operation-forms/postgres-operation-forms";
import { createDatabaseHandle } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import { auditEvents, authSessions, operationForms, recruitingCommandReceipts, recruitingNonceBindings, recruitingOutbox, userAccounts } from "../../src/platform/db/schema";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

test("S09 operation forms persist signed submissions and ADMIN TOTP mutations atomically", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({ connectionString, nodeEnv: process.env.NODE_ENV, testMode: process.env.V2_DB_TEST_MODE });
  const { database, pool } = createDatabaseHandle(connectionString, { max: 4 });
  try {
    await applyMigrations(database); await applyMigrations(database);
    const typeRows = await pool.query<{ enumlabel: string }>(`select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='recruiting' and t.typname='operation_form_type' order by e.enumsortorder`);
    assert.deepEqual(typeRows.rows.map((row) => row.enumlabel), ["friends", "leaves", "meetups", "suggestions"]);

    const service = new PostgresOperationForms(database); const signedAt = new Date();
    const submit = {
      actorPrincipalId: "bot:kakao-operation-forms", requestId: randomUUID(), formType: "suggestions" as const,
      idempotency: { requestKey: "operation-form-submit-contract-0001", bodyDigestHex: "ab".repeat(32) },
      intent: {
        kind: "KAKAO_HMAC" as const, keyId: "contract", timestampSeconds: Math.floor(signedAt.getTime() / 1_000),
        nonce: "operation_nonce_contract_0001", roomId: "room-contract", senderId: "sender-contract",
        bodyDigestHex: "ab".repeat(32), requireNonceClaim: true as const, transactionRecheck: true as const,
      },
      payload: { applicantName: "신청자", applicantNickname: "계약닉", reason: "운영 개선", content: "저장 계약 검증" },
    };
    const created = await service.submit(submit); assert.equal(created.status, 201); assert.equal(created.replayed, false);
    const replay = await service.submit(submit); assert.equal(replay.replayed, true); assert.deepEqual(replay.body, created.body);
    const otherSender = await service.submit({
      ...submit, requestId: randomUUID(),
      intent: { ...submit.intent, nonce: "operation_nonce_contract_0002", senderId: "sender-contract-other" },
    });
    const otherRoom = await service.submit({
      ...submit, requestId: randomUUID(),
      intent: { ...submit.intent, nonce: "operation_nonce_contract_0003", roomId: "room-contract-other" },
    });
    assert.equal(otherSender.replayed, false); assert.equal(otherRoom.replayed, false);
    assert.notEqual((otherSender.body.form as { id: string }).id, (created.body.form as { id: string }).id);
    assert.notEqual((otherRoom.body.form as { id: string }).id, (created.body.form as { id: string }).id);
    const submittedRows = await database.select().from(operationForms);
    assert.equal(submittedRows.length, 3);
    assert.deepEqual(
      submittedRows.map((row) => [row.sourceRoomId, row.sourceSenderId]).sort(),
      [["room-contract", "sender-contract"], ["room-contract", "sender-contract-other"], ["room-contract-other", "sender-contract"]].sort(),
    );
    assert.equal((await database.select().from(recruitingNonceBindings).where(eq(recruitingNonceBindings.actorPrincipalId, submit.actorPrincipalId))).length, 3);
    assert.equal((await database.select().from(recruitingCommandReceipts).where(eq(recruitingCommandReceipts.actorPrincipalId, submit.actorPrincipalId))).length, 3);
    assert.equal((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateType, "OPERATION_FORM"))).length, 3);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "OPERATION_FORM"))).length, 3);
    await assert.rejects(service.submit({ ...submit, idempotency: { ...submit.idempotency, bodyDigestHex: "cd".repeat(32) } }), (error: unknown) => error instanceof OperationFormApplicationError && error.code === "IDEMPOTENCY_MISMATCH");

    const adminId = randomUUID(); const sessionId = randomUUID(); const now = new Date();
    await database.insert(userAccounts).values({ id: adminId, loginId: "s09-operation-admin", loginIdNormalized: "s09-operation-admin", role: "ADMIN", status: "APPROVED" });
    await database.insert(authSessions).values({
      id: sessionId, tokenHash: randomBytes(32), userAccountId: adminId, authVersion: 0, role: "ADMIN", purpose: "ADMIN",
      totpVerifiedAt: now, issuedAt: now, expiresAt: new Date(now.getTime() + 60 * 60_000),
    });
    const session: AuthSession = {
      sessionId, userId: adminId, role: "ADMIN", purpose: "ADMIN", accountStatus: "APPROVED", mustChangePassword: false,
      authVersion: 0, adminTotpVerified: true, source: "database", issuedAt: Math.floor(now.getTime() / 1_000), expiresAt: Math.floor(now.getTime() / 1_000) + 3_600,
    };
    const createdForm = (created.body.form as { id: string });
    const review = await service.review({
      session, requestId: randomUUID(), formType: "suggestions", id: createdForm.id, expectedRevision: 0,
      idempotency: { requestKey: "operation-form-review-contract-0001", bodyDigestHex: "ef".repeat(32) }, status: "COMPLETED", adminNote: "처리 완료",
    });
    assert.equal(review.revision, 1); assert.equal((review.body.form as { status: string }).status, "COMPLETED");
    const removed = await service.softDelete({
      session, requestId: randomUUID(), formType: "suggestions", id: createdForm.id, expectedRevision: 1,
      idempotency: { requestKey: "operation-form-delete-contract-0001", bodyDigestHex: "12".repeat(32) }, reason: "계약 테스트 정리",
    });
    assert.deepEqual(removed.body, { deleted: true, id: createdForm.id, revision: 2 });
    const retained = (await database.select().from(operationForms).where(eq(operationForms.id, createdForm.id)))[0];
    assert.ok(retained?.deletedAt); assert.equal((await service.list()).items.length, 2);
    assert.equal((await database.select().from(recruitingOutbox).where(eq(recruitingOutbox.aggregateType, "OPERATION_FORM"))).length, 5);
    assert.equal((await database.select().from(auditEvents).where(eq(auditEvents.targetType, "OPERATION_FORM"))).length, 5);
  } finally { await pool.end(); }
});
