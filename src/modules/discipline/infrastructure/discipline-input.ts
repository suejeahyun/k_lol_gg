import type { CreateDisciplineRecordInput, UpdateDisciplineRecordInput } from "../application/ports";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const types = new Set(["CAUTION", "WARNING", "BAN"]);
const categories = new Set(["GENERAL", "INHOUSE"]);

export function parseCreateDisciplineRecord(value: unknown): CreateDisciplineRecordInput | null {
  const input = record(value);
  const keys = new Set(["userAccountId", "playerId", "targetName", "targetNickname", "targetTagLine", "type", "category", "source", "reason", "internalNote"]);
  if (!input || Object.keys(input).some((key) => !keys.has(key))) return null;
  const nullableId = (item: unknown) => item === null || (typeof item === "string" && uuid.test(item));
  const nullableText = (item: unknown) => item === null || typeof item === "string";
  if (!nullableId(input.userAccountId ?? null) || !nullableId(input.playerId ?? null) || typeof input.targetName !== "string" || !nullableText(input.targetNickname ?? null) || !nullableText(input.targetTagLine ?? null) || typeof input.type !== "string" || !types.has(input.type) || typeof input.category !== "string" || !categories.has(input.category) || typeof input.source !== "string" || typeof input.reason !== "string" || !nullableText(input.internalNote ?? null)) return null;
  return {
    userAccountId: (input.userAccountId as string | null | undefined) ?? null,
    playerId: (input.playerId as string | null | undefined) ?? null,
    targetName: input.targetName,
    targetNickname: (input.targetNickname as string | null | undefined) ?? null,
    targetTagLine: (input.targetTagLine as string | null | undefined) ?? null,
    type: input.type as CreateDisciplineRecordInput["type"],
    category: input.category as CreateDisciplineRecordInput["category"],
    source: input.source,
    reason: input.reason,
    internalNote: (input.internalNote as string | null | undefined) ?? null,
  };
}

export function parseUpdateDisciplineRecord(value: unknown): UpdateDisciplineRecordInput | null {
  const input = record(value);
  if (!input || Object.keys(input).some((key) => !["reason", "internalNote"].includes(key)) || typeof input.reason !== "string" || (input.internalNote !== null && input.internalNote !== undefined && typeof input.internalNote !== "string")) return null;
  return { reason: input.reason, internalNote: (input.internalNote as string | null | undefined) ?? null };
}

export function parseCancelDisciplineRecord(value: unknown) {
  const input = record(value);
  return input && Object.keys(input).length === 1 && typeof input.reason === "string" ? { reason: input.reason } : null;
}

export function parseDisciplineReview(value: unknown) {
  const input = record(value);
  if (!input || Object.keys(input).some((key) => !["decision", "reviewNote"].includes(key)) || typeof input.decision !== "string" || !["APPROVE", "REJECT", "CANCEL"].includes(input.decision) || typeof input.reviewNote !== "string") return null;
  return { decision: input.decision as "APPROVE" | "REJECT" | "CANCEL", reviewNote: input.reviewNote };
}
