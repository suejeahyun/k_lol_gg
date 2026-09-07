import { canonicalIdentifier, requireCompetition } from "./error";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;

export type CompetitionCommandActor =
  | Readonly<{
      userAccountId: string;
      sessionId: string;
      purpose: "ACCOUNT";
      requiredRole: "USER";
    }>
  | Readonly<{
      userAccountId: string;
      sessionId: string;
      purpose: "ADMIN";
      requiredRole: "ADMIN";
    }>;

export type CompetitionCommandEnvelope<TPayload extends JsonObject = JsonObject> = Readonly<{
  actor: CompetitionCommandActor;
  authorization: "APPROVED_ACCOUNT_MUTATION" | "ADMIN_MUTATION";
  requestId: string;
  aggregateId: string | null;
  expectedRevision: number | null;
  scope: string;
  keyHash: Uint8Array;
  requestHash: Uint8Array;
  issuedAt: string;
  payload: TPayload;
}>;

export type CompetitionCommandReceipt<TBody extends JsonObject = JsonObject> = Readonly<{
  actorUserAccountId: string;
  scope: string;
  keyHash: Uint8Array;
  requestHash: Uint8Array;
  responseStatus: number;
  body: TBody;
  revision: number | null;
  createdAt: string;
  expiresAt: string;
}>;

export type CompetitionAuditEvent = Readonly<{
  requestId: string;
  actorUserAccountId: string;
  action: string;
  targetType: "EVENT" | "EVENT_TEAM" | "EVENT_FIXTURE" | "DESTRUCTION" | "DESTRUCTION_TEAM" | "DESTRUCTION_FIXTURE";
  targetId: string;
  before: JsonObject | null;
  after: JsonObject | null;
  metadata: JsonObject;
  occurredAt: string;
}>;

export type CompetitionOutboxEvent = Readonly<{
  id: string;
  requestId: string;
  aggregateType: "EVENT" | "DESTRUCTION";
  aggregateId: string;
  aggregateRevision: number;
  eventType: string;
  dedupeKey: string;
  payload: JsonObject;
  status: "PENDING" | "DELIVERED" | "FAILED";
  attemptCount: number;
  occurredAt: string;
  deliveredAt: string | null;
}>;

const SENSITIVE_KEY = /(?:authorization|cookie|idempotency.?key|pass(?:word|key)|secret|session.?token|access.?token|refresh.?token)/iu;

function canonicalInstant(value: string, label: string) {
  const time = Date.parse(value);
  requireCompetition(Number.isFinite(time) && new Date(time).toISOString() === value, "INVALID_COMMAND_CONTRACT", `${label} must be a canonical ISO instant.`);
  return time;
}

function sha256(value: Uint8Array, label: string) {
  requireCompetition(value instanceof Uint8Array && value.byteLength === 32, "INVALID_COMMAND_CONTRACT", `${label} must be a 32-byte digest.`);
}

function safeJson(value: JsonValue, label: string) {
  const ancestors = new Set<object>();
  let visited = 0;
  const visit = (entry: JsonValue, depth: number): void => {
    visited += 1;
    requireCompetition(depth <= 16 && visited <= 10_000, "INVALID_COMMAND_CONTRACT", `${label} is too deeply nested or large.`);
    if (entry === null || typeof entry === "string" || typeof entry === "boolean") return;
    if (typeof entry === "number") {
      requireCompetition(Number.isFinite(entry), "INVALID_COMMAND_CONTRACT", `${label} contains a non-finite number.`);
      return;
    }
    requireCompetition(typeof entry === "object", "INVALID_COMMAND_CONTRACT", `${label} must contain JSON values only.`);
    requireCompetition(!ancestors.has(entry as object), "INVALID_COMMAND_CONTRACT", `${label} must not contain cycles.`);
    ancestors.add(entry as object);
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item, depth + 1);
    } else {
      const prototype = Object.getPrototypeOf(entry);
      requireCompetition(
        prototype === Object.prototype || prototype === null,
        "INVALID_COMMAND_CONTRACT",
        `${label} must contain plain JSON objects only.`,
      );
      for (const [key, item] of Object.entries(entry)) {
        requireCompetition(!SENSITIVE_KEY.test(key), "INVALID_COMMAND_CONTRACT", `${label} must not contain raw secret fields.`);
        visit(item, depth + 1);
      }
    }
    ancestors.delete(entry as object);
  };
  visit(value, 0);
}

export function validateCompetitionCommandEnvelope<TPayload extends JsonObject>(
  envelope: CompetitionCommandEnvelope<TPayload>,
) {
  canonicalIdentifier(envelope.actor.userAccountId, "actor.userAccountId");
  canonicalIdentifier(envelope.actor.sessionId, "actor.sessionId");
  canonicalIdentifier(envelope.requestId, "requestId");
  canonicalIdentifier(envelope.scope, "scope");
  requireCompetition(
    envelope.actor.purpose === "ADMIN"
      ? envelope.authorization === "ADMIN_MUTATION" && envelope.actor.requiredRole === "ADMIN"
      : envelope.authorization === "APPROVED_ACCOUNT_MUTATION" && envelope.actor.requiredRole === "USER",
    "INVALID_COMMAND_CONTRACT",
    "The actor purpose and authorization contract do not match.",
  );
  requireCompetition(
    envelope.aggregateId === null
      ? envelope.expectedRevision === null
      : Number.isSafeInteger(envelope.expectedRevision) && envelope.expectedRevision! >= 0,
    "INVALID_COMMAND_CONTRACT",
    "An existing aggregate requires a non-negative expected revision; a create command requires neither.",
  );
  if (envelope.aggregateId !== null) canonicalIdentifier(envelope.aggregateId, "aggregateId");
  sha256(envelope.keyHash, "keyHash");
  sha256(envelope.requestHash, "requestHash");
  canonicalInstant(envelope.issuedAt, "issuedAt");
  safeJson(envelope.payload, "payload");
  return envelope;
}

export function validateCompetitionCommandReceipt<TBody extends JsonObject>(
  receipt: CompetitionCommandReceipt<TBody>,
) {
  canonicalIdentifier(receipt.actorUserAccountId, "actorUserAccountId");
  canonicalIdentifier(receipt.scope, "scope");
  sha256(receipt.keyHash, "keyHash");
  sha256(receipt.requestHash, "requestHash");
  requireCompetition(Number.isSafeInteger(receipt.responseStatus) && receipt.responseStatus >= 200 && receipt.responseStatus <= 299, "INVALID_COMMAND_CONTRACT", "A command receipt stores only successful response status codes.");
  requireCompetition(receipt.revision === null || (Number.isSafeInteger(receipt.revision) && receipt.revision >= 0), "INVALID_COMMAND_CONTRACT", "Receipt revision must be null or non-negative.");
  const createdAt = canonicalInstant(receipt.createdAt, "createdAt");
  const expiresAt = canonicalInstant(receipt.expiresAt, "expiresAt");
  requireCompetition(expiresAt > createdAt, "INVALID_COMMAND_CONTRACT", "A receipt must expire after it is created.");
  safeJson(receipt.body, "body");
  return receipt;
}

export function validateCompetitionAuditEvent(event: CompetitionAuditEvent) {
  canonicalIdentifier(event.requestId, "requestId");
  canonicalIdentifier(event.actorUserAccountId, "actorUserAccountId");
  canonicalIdentifier(event.targetId, "targetId");
  requireCompetition(/^[A-Z][A-Z0-9_]{2,63}$/u.test(event.action), "INVALID_COMMAND_CONTRACT", "Audit action must be a stable uppercase identifier.");
  requireCompetition(event.before !== null || event.after !== null, "INVALID_COMMAND_CONTRACT", "An audit event requires before or after state.");
  if (event.before) safeJson(event.before, "before");
  if (event.after) safeJson(event.after, "after");
  safeJson(event.metadata, "metadata");
  canonicalInstant(event.occurredAt, "occurredAt");
  return event;
}

export function validateCompetitionOutboxEvent(event: CompetitionOutboxEvent) {
  canonicalIdentifier(event.id, "outbox.id");
  canonicalIdentifier(event.requestId, "requestId");
  canonicalIdentifier(event.aggregateId, "aggregateId");
  canonicalIdentifier(event.dedupeKey, "dedupeKey");
  requireCompetition(Number.isSafeInteger(event.aggregateRevision) && event.aggregateRevision >= 1, "INVALID_COMMAND_CONTRACT", "Outbox aggregate revision must be positive.");
  requireCompetition(/^[A-Z][A-Z0-9_]{2,63}$/u.test(event.eventType), "INVALID_COMMAND_CONTRACT", "Outbox eventType must be a stable uppercase identifier.");
  requireCompetition(Number.isSafeInteger(event.attemptCount) && event.attemptCount >= 0, "INVALID_COMMAND_CONTRACT", "Outbox attemptCount must be non-negative.");
  const occurredAt = canonicalInstant(event.occurredAt, "occurredAt");
  const deliveredAt = event.deliveredAt === null ? null : canonicalInstant(event.deliveredAt, "deliveredAt");
  requireCompetition(
    event.status === "DELIVERED" ? deliveredAt !== null && deliveredAt >= occurredAt : deliveredAt === null,
    "INVALID_COMMAND_CONTRACT",
    "Only delivered outbox events have a deliveredAt instant.",
  );
  safeJson(event.payload, "payload");
  return event;
}
