import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { ADMIN_MUTATION_SESSION_POLICY, lockTransactionSessionActor } from "@/modules/auth/infrastructure/transaction-session-guard";
import { auditEvents } from "@/platform/db/schema/audit";
import {
  operationForms,
  recruitingCommandReceipts,
  recruitingNonceBindings,
  recruitingOutbox,
} from "@/platform/db/schema/recruiting";
import type { V2Database } from "@/platform/db/database";
import type { V2Transaction } from "@/platform/db/transaction";
import { withTransaction } from "@/platform/db/transaction";

import type { VerifiedKakaoWebhookIntent } from "../infrastructure/kakao-signature";
import {
  type AdminOperationFormDto,
  isOperationFormStatus,
  isOperationFormType,
  type OperationForm,
  OperationFormError,
  type OperationFormStatus,
  type OperationFormType,
  parseOperationFormPayload,
  reviewOperationForm,
  softDeleteOperationForm,
  toAdminOperationFormDto,
} from "./domain";

const RECEIPT_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const NONCE_TTL_MILLISECONDS = 15 * 60 * 1_000;

export type OperationFormIdempotency = Readonly<{
  requestKey: string;
  bodyDigestHex: string;
}>;

export type OperationFormMutationResult = Readonly<{
  body: Record<string, unknown>;
  revision: number;
  replayed: boolean;
  status: 200 | 201;
}>;

export type OperationFormList = Readonly<{
  items: readonly AdminOperationFormDto[];
  counts: Readonly<Record<OperationFormType, number>>;
}>;

function sha256(value: string) { return createHash("sha256").update(value).digest(); }
function sameBytes(left: Uint8Array, right: Uint8Array) { return Buffer.from(left).equals(Buffer.from(right)); }
function validDigest(value: string) { return /^[a-f0-9]{64}$/u.test(value); }

function fromRow(row: typeof operationForms.$inferSelect): OperationForm {
  if (!isOperationFormType(row.formType) || !isOperationFormStatus(row.status)) throw new Error("Stored operation form enum is invalid.");
  return Object.freeze({
    id: row.id,
    revision: row.revision,
    formType: row.formType,
    status: row.status,
    payload: parseOperationFormPayload(row.formType, row.payloadJson),
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    adminNote: row.adminNote,
    reviewedByUserAccountId: row.reviewedByUserAccountId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    deletedByUserAccountId: row.deletedByUserAccountId,
    deletionReason: row.deletionReason,
  });
}

function publicBody(form: OperationForm): Record<string, unknown> {
  return { form: toAdminOperationFormDto(form) };
}

function mutationFingerprint(scope: string, expectedRevision: number, digest: string) {
  return sha256(["klol-v2:operation-form-request:v1", scope, expectedRevision, digest].join("\0"));
}

export class OperationFormApplicationError extends Error {
  constructor(readonly code: "IDEMPOTENCY_MISMATCH" | "NOT_FOUND" | "SESSION_STALE" | "FORBIDDEN") { super(code); }
}

type ReceiptReplay = Readonly<{ body: Record<string, unknown>; revision: number; status: 200 | 201 }>;

export class PostgresOperationForms {
  constructor(private readonly database: V2Database) {}

  private async claimReceipt(transaction: V2Transaction, input: Readonly<{
    actorPrincipalId: string;
    scope: string;
    expectedRevision: number;
    idempotency: OperationFormIdempotency;
  }>): Promise<Readonly<{ replay: null; keyHash: Buffer; requestHash: Buffer }> | Readonly<{ replay: ReceiptReplay; keyHash: Buffer; requestHash: Buffer }>> {
    if (!validDigest(input.idempotency.bodyDigestHex)) throw new OperationFormError("INVALID_FORM_PAYLOAD");
    const keyHash = sha256(`klol-v2:operation-form-key:v1\0${input.idempotency.requestKey}`);
    const requestHash = mutationFingerprint(input.scope, input.expectedRevision, input.idempotency.bodyDigestHex);
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.actorPrincipalId}:${input.scope}:${keyHash.toString("hex")}`}, 0))`);
    const current = (await transaction.select().from(recruitingCommandReceipts).where(and(
      eq(recruitingCommandReceipts.actorPrincipalId, input.actorPrincipalId),
      eq(recruitingCommandReceipts.scope, input.scope),
      eq(recruitingCommandReceipts.keyHash, keyHash),
    )).limit(1))[0];
    const now = new Date();
    if (current && current.expiresAt > now) {
      if (!sameBytes(current.requestHash, requestHash) || current.bodyDigestHex !== input.idempotency.bodyDigestHex) {
        throw new OperationFormApplicationError("IDEMPOTENCY_MISMATCH");
      }
      if (!current.responseJson || current.responseRevision === null || (current.responseStatus !== 200 && current.responseStatus !== 201)) {
        throw new Error("Operation form receipt committed without a response.");
      }
      return { replay: { body: current.responseJson, revision: current.responseRevision, status: current.responseStatus }, keyHash, requestHash };
    }
    const values = {
      actorPrincipalId: input.actorPrincipalId, scope: input.scope, keyHash, requestHash,
      bodyDigestHex: input.idempotency.bodyDigestHex, responseStatus: null, responseJson: null, responseRevision: null,
      createdAt: now, expiresAt: new Date(now.getTime() + RECEIPT_TTL_MILLISECONDS),
    };
    if (current) await transaction.update(recruitingCommandReceipts).set(values).where(eq(recruitingCommandReceipts.id, current.id));
    else await transaction.insert(recruitingCommandReceipts).values({ id: randomUUID(), ...values });
    return { replay: null, keyHash, requestHash };
  }

  private async completeReceipt(transaction: V2Transaction, input: Readonly<{
    actorPrincipalId: string; scope: string; keyHash: Buffer; requestHash: Buffer; result: ReceiptReplay;
  }>) {
    const updated = await transaction.update(recruitingCommandReceipts).set({
      responseStatus: input.result.status, responseJson: input.result.body, responseRevision: input.result.revision,
    }).where(and(
      eq(recruitingCommandReceipts.actorPrincipalId, input.actorPrincipalId), eq(recruitingCommandReceipts.scope, input.scope),
      eq(recruitingCommandReceipts.keyHash, input.keyHash), eq(recruitingCommandReceipts.requestHash, input.requestHash),
    )).returning({ id: recruitingCommandReceipts.id });
    if (updated.length !== 1) throw new Error("Operation form receipt disappeared before completion.");
  }

  private async claimKakaoNonce(transaction: V2Transaction, actorPrincipalId: string, intent: VerifiedKakaoWebhookIntent, identity: Readonly<{
    scope: string; keyHash: Buffer; requestHash: Buffer;
  }>) {
    if (!intent.requireNonceClaim || !intent.transactionRecheck) throw new OperationFormApplicationError("FORBIDDEN");
    const nonceHash = sha256(`klol-v2:recruiting-nonce:v1\0${actorPrincipalId}\0${intent.nonce}`);
    const bindingHash = sha256(["klol-v2:operation-form-nonce-binding:v1", identity.scope, identity.keyHash.toString("hex"), identity.requestHash.toString("hex"), intent.bodyDigestHex].join("\0"));
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actorPrincipalId}:${nonceHash.toString("hex")}`}, 0))`);
    const current = (await transaction.select().from(recruitingNonceBindings).where(and(
      eq(recruitingNonceBindings.actorPrincipalId, actorPrincipalId), eq(recruitingNonceBindings.nonceHash, nonceHash),
    )).limit(1))[0];
    const now = new Date();
    if (current && current.expiresAt > now) {
      if (!sameBytes(current.bindingHash, bindingHash)) throw new OperationFormApplicationError("FORBIDDEN");
      return;
    }
    const values = {
      actorKind: "BOT" as const, actorPrincipalId, nonceHash, bindingHash, keyId: intent.keyId,
      createdAt: now, expiresAt: new Date(now.getTime() + NONCE_TTL_MILLISECONDS),
    };
    if (current) await transaction.update(recruitingNonceBindings).set(values).where(eq(recruitingNonceBindings.id, current.id));
    else await transaction.insert(recruitingNonceBindings).values({ id: randomUUID(), ...values });
  }

  private async recheckAdmin(transaction: V2Transaction, session: AuthSession) {
    const account = await lockTransactionSessionActor(transaction, transactionSessionActor(session), new Date(), ADMIN_MUTATION_SESSION_POLICY);
    if (!account || account.id !== session.userId) throw new OperationFormApplicationError("SESSION_STALE");
    if (account.role !== "ADMIN" && account.role !== "SUPER_ADMIN") throw new OperationFormApplicationError("FORBIDDEN");
  }

  private async appendEvent(transaction: V2Transaction, input: Readonly<{
    requestId: string; actorUserAccountId: string | null; action: string; form: OperationForm;
    before: Record<string, unknown> | null; after: Record<string, unknown>;
  }>) {
    await transaction.insert(auditEvents).values({
      requestId: input.requestId, actorUserAccountId: input.actorUserAccountId, action: input.action,
      targetType: "OPERATION_FORM", targetId: input.form.id, beforeJson: input.before, afterJson: input.after,
      metadataJson: { formType: input.form.formType }, createdAt: new Date(input.form.updatedAt),
    });
    await transaction.insert(recruitingOutbox).values({
      id: `operation-form:${input.requestId}`, requestId: input.requestId, aggregateType: "OPERATION_FORM",
      aggregateId: input.form.id, aggregateRevision: input.form.revision, eventType: input.action,
      dedupeKey: `operation-form:${input.requestId}:${input.action}`, payloadJson: input.after,
      createdAt: new Date(input.form.updatedAt),
    });
  }

  async submit(input: Readonly<{
    actorPrincipalId: string; intent: VerifiedKakaoWebhookIntent; requestId: string;
    idempotency: OperationFormIdempotency; formType: OperationFormType; payload: unknown;
  }>): Promise<OperationFormMutationResult> {
    const payload = parseOperationFormPayload(input.formType, input.payload);
    return withTransaction(this.database, async (transaction) => {
      const submitterScope = sha256(`klol-v2:operation-form-submitter:v1\0${input.intent.roomId}\0${input.intent.senderId}`).toString("hex");
      const scope = `BOT:SUBMIT_OPERATION_FORM:${input.formType}:${submitterScope}`;
      const receipt = await this.claimReceipt(transaction, { actorPrincipalId: input.actorPrincipalId, scope, expectedRevision: 0, idempotency: input.idempotency });
      await this.claimKakaoNonce(transaction, input.actorPrincipalId, input.intent, { scope, keyHash: receipt.keyHash, requestHash: receipt.requestHash });
      if (receipt.replay) return { ...receipt.replay, replayed: true };
      const now = new Date(input.intent.timestampSeconds * 1_000);
      const form: OperationForm = Object.freeze({
        id: randomUUID(), revision: 0, formType: input.formType, status: "PENDING", payload,
        submittedAt: now.toISOString(), updatedAt: now.toISOString(), adminNote: null,
        reviewedByUserAccountId: null, reviewedAt: null, deletedAt: null,
        deletedByUserAccountId: null, deletionReason: null,
      });
      await transaction.insert(operationForms).values({
        id: form.id, revision: form.revision, formType: form.formType, status: form.status,
        payloadJson: form.payload, sourceRoomId: input.intent.roomId, sourceSenderId: input.intent.senderId,
        submittedAt: now, createdAt: now, updatedAt: now,
      });
      const body = publicBody(form); const requestId = input.requestId;
      await this.appendEvent(transaction, { requestId, actorUserAccountId: null, action: "OPERATION_FORM_SUBMITTED", form, before: null, after: body });
      const result = { body, revision: 0, status: 201 as const };
      await this.completeReceipt(transaction, { actorPrincipalId: input.actorPrincipalId, scope, keyHash: receipt.keyHash, requestHash: receipt.requestHash, result });
      return { ...result, replayed: false };
    });
  }

  async list(input: Readonly<{ formType?: OperationFormType; status?: OperationFormStatus; limit?: number }> = {}): Promise<OperationFormList> {
    const conditions = [sql`${operationForms.deletedAt} IS NULL`];
    if (input.formType) conditions.push(eq(operationForms.formType, input.formType));
    if (input.status) conditions.push(eq(operationForms.status, input.status));
    const rows = await this.database.select().from(operationForms).where(and(...conditions)).orderBy(desc(operationForms.submittedAt), desc(operationForms.id)).limit(Math.min(Math.max(input.limit ?? 100, 1), 100));
    const allCounts = await this.database.select({ formType: operationForms.formType, value: sql<number>`count(*)::int` }).from(operationForms).where(sql`${operationForms.deletedAt} IS NULL`).groupBy(operationForms.formType);
    const counts = { friends: 0, leaves: 0, meetups: 0, suggestions: 0 };
    for (const row of allCounts) counts[row.formType] = row.value;
    return { items: rows.map(fromRow).map(toAdminOperationFormDto), counts };
  }

  async get(formType: OperationFormType, id: string) {
    const row = (await this.database.select().from(operationForms).where(and(
      eq(operationForms.id, id), eq(operationForms.formType, formType), sql`${operationForms.deletedAt} IS NULL`,
    )).limit(1))[0];
    return row ? toAdminOperationFormDto(fromRow(row)) : null;
  }

  async review(input: Readonly<{
    session: AuthSession; requestId: string; idempotency: OperationFormIdempotency;
    formType: OperationFormType; id: string; expectedRevision: number; status?: unknown; adminNote?: unknown;
  }>): Promise<OperationFormMutationResult> {
    return withTransaction(this.database, async (transaction) => {
      await this.recheckAdmin(transaction, input.session);
      const scope = `ADMIN:REVIEW_OPERATION_FORM:${input.formType}:${input.id}`;
      const receipt = await this.claimReceipt(transaction, { actorPrincipalId: input.session.userId, scope, expectedRevision: input.expectedRevision, idempotency: input.idempotency });
      if (receipt.replay) return { ...receipt.replay, replayed: true };
      const row = (await transaction.select().from(operationForms).where(and(eq(operationForms.id, input.id), eq(operationForms.formType, input.formType), sql`${operationForms.deletedAt} IS NULL`)).for("update").limit(1))[0];
      if (!row) throw new OperationFormApplicationError("NOT_FOUND");
      const beforeForm = fromRow(row);
      const form = reviewOperationForm({ form: beforeForm, expectedRevision: input.expectedRevision, status: input.status, adminNote: input.adminNote, reviewerUserAccountId: input.session.userId, now: new Date() });
      const updated = await transaction.update(operationForms).set({
        revision: form.revision, status: form.status, adminNote: form.adminNote,
        reviewedByUserAccountId: form.reviewedByUserAccountId, reviewedAt: new Date(form.reviewedAt!), updatedAt: new Date(form.updatedAt),
      }).where(and(eq(operationForms.id, form.id), eq(operationForms.revision, input.expectedRevision))).returning({ id: operationForms.id });
      if (updated.length !== 1) throw new OperationFormError("STALE_FORM_REVISION");
      const body = publicBody(form); const before = publicBody(beforeForm);
      await this.appendEvent(transaction, { requestId: input.requestId, actorUserAccountId: input.session.userId, action: "OPERATION_FORM_REVIEWED", form, before, after: body });
      const result = { body, revision: form.revision, status: 200 as const };
      await this.completeReceipt(transaction, { actorPrincipalId: input.session.userId, scope, keyHash: receipt.keyHash, requestHash: receipt.requestHash, result });
      return { ...result, replayed: false };
    });
  }

  async softDelete(input: Readonly<{
    session: AuthSession; requestId: string; idempotency: OperationFormIdempotency;
    formType: OperationFormType; id: string; expectedRevision: number; reason: unknown;
  }>): Promise<OperationFormMutationResult> {
    return withTransaction(this.database, async (transaction) => {
      await this.recheckAdmin(transaction, input.session);
      const scope = `ADMIN:DELETE_OPERATION_FORM:${input.formType}:${input.id}`;
      const receipt = await this.claimReceipt(transaction, { actorPrincipalId: input.session.userId, scope, expectedRevision: input.expectedRevision, idempotency: input.idempotency });
      if (receipt.replay) return { ...receipt.replay, replayed: true };
      const row = (await transaction.select().from(operationForms).where(and(eq(operationForms.id, input.id), eq(operationForms.formType, input.formType), sql`${operationForms.deletedAt} IS NULL`)).for("update").limit(1))[0];
      if (!row) throw new OperationFormApplicationError("NOT_FOUND");
      const beforeForm = fromRow(row);
      const form = softDeleteOperationForm({ form: beforeForm, expectedRevision: input.expectedRevision, reason: input.reason, deletedByUserAccountId: input.session.userId, now: new Date() });
      const updated = await transaction.update(operationForms).set({
        revision: form.revision, deletedAt: new Date(form.deletedAt!), deletedByUserAccountId: form.deletedByUserAccountId,
        deletionReason: form.deletionReason, updatedAt: new Date(form.updatedAt),
      }).where(and(eq(operationForms.id, form.id), eq(operationForms.revision, input.expectedRevision))).returning({ id: operationForms.id });
      if (updated.length !== 1) throw new OperationFormError("STALE_FORM_REVISION");
      const body = { deleted: true, id: form.id, revision: form.revision };
      await this.appendEvent(transaction, { requestId: input.requestId, actorUserAccountId: input.session.userId, action: "OPERATION_FORM_DELETED", form, before: publicBody(beforeForm), after: body });
      const result = { body, revision: form.revision, status: 200 as const };
      await this.completeReceipt(transaction, { actorPrincipalId: input.session.userId, scope, keyHash: receipt.keyHash, requestHash: receipt.requestHash, result });
      return { ...result, replayed: false };
    });
  }
}
