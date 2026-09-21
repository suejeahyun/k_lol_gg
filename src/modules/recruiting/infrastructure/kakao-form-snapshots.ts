import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, sql } from "drizzle-orm";

import type { JsonObject, JsonValue } from "@/modules/competitions/core/command-contracts";
import { canonicalJson } from "@/modules/seasons/domain/season";
import { kakaoFormSnapshots } from "@/platform/db/schema/kakao-form-snapshots";
import type { V2Transaction } from "@/platform/db/transaction";

import { recruitingOperatingDateKey } from "../domain/operating-day";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/;
const MAX_STATE_BYTES = 65_536;
const CLEANUP_BATCH_SIZE = 256;

type SnapshotBinding = Readonly<{
  kind: "PARTY" | "INHOUSE";
  /** Derived from the authorized installation scope, not an unverified chat title. */
  scopeHash: Buffer;
  targetId: string;
  operatingDate: string;
  now: Date;
}>;

export function normalizeKakaoFormSnapshotCode(value: string): string | null {
  const code = value.normalize("NFKC").trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** The supplied operating day ends at 06:00 KST on the next calendar date. */
export function kakaoFormSnapshotExpiry(operatingDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operatingDate)) throw new Error("INVALID_KAKAO_FORM_OPERATING_DATE");
  const expiry = new Date(`${operatingDate}T21:00:00.000Z`);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== operatingDate) {
    throw new Error("INVALID_KAKAO_FORM_OPERATING_DATE");
  }
  return expiry;
}

function isJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJson(entry, depth + 1));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every((entry) => isJson(entry, depth + 1));
}

export function kakaoFormSnapshotStateHash(state: JsonObject): Buffer {
  if (!state || typeof state !== "object" || Array.isArray(state) || !isJson(state)) throw new Error("INVALID_KAKAO_FORM_SNAPSHOT_STATE");
  const canonical = canonicalJson(state);
  // One-space pretty JSON is a conservative bound for jsonb::text, including
  // separator whitespace, so an accepted object fits the database constraint.
  if (Buffer.byteLength(JSON.stringify(state, null, 1), "utf8") > MAX_STATE_BYTES) throw new Error("KAKAO_FORM_SNAPSHOT_TOO_LARGE");
  return createHash("sha256").update(canonical).digest();
}

function validBinding(input: SnapshotBinding): boolean {
  return (input.kind === "PARTY" || input.kind === "INHOUSE") &&
    Buffer.isBuffer(input.scopeHash) && input.scopeHash.length === 32 &&
    typeof input.targetId === "string" && input.targetId.trim().length > 0 && input.targetId.length <= 160 &&
    Number.isFinite(input.now.getTime());
}

function newCode(): string {
  const bytes = randomBytes(10);
  const raw = [...bytes].map((value) => CODE_ALPHABET[value & 31]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

/** Bounded, non-blocking retention cleanup; callers must use their authorized transaction. */
export async function pruneExpiredKakaoFormSnapshots(transaction: V2Transaction, now: Date): Promise<void> {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_KAKAO_FORM_SNAPSHOT_INSTANT");
  await transaction.execute(sql`
    delete from ${kakaoFormSnapshots}
    where ${kakaoFormSnapshots.code} in (
      select code from ${kakaoFormSnapshots}
      where expires_at <= ${now.toISOString()}::timestamptz
      order by expires_at, code
      limit ${CLEANUP_BATCH_SIZE}
      for update skip locked
    )
  `);
}

export async function issueKakaoFormSnapshot(
  transaction: V2Transaction,
  input: SnapshotBinding & Readonly<{ state: JsonObject }>,
): Promise<string> {
  if (!validBinding(input) || input.operatingDate !== recruitingOperatingDateKey(input.now)) {
    throw new Error("INVALID_KAKAO_FORM_SNAPSHOT_BINDING");
  }
  const expiresAt = kakaoFormSnapshotExpiry(input.operatingDate);
  const stateHash = kakaoFormSnapshotStateHash(input.state);
  await pruneExpiredKakaoFormSnapshots(transaction, input.now);
  const matchesState = and(
    eq(kakaoFormSnapshots.kind, input.kind), eq(kakaoFormSnapshots.scopeHash, input.scopeHash),
    eq(kakaoFormSnapshots.targetId, input.targetId), eq(kakaoFormSnapshots.operatingDate, input.operatingDate),
    eq(kakaoFormSnapshots.stateHash, stateHash), gt(kakaoFormSnapshots.expiresAt, input.now),
  );
  const existing = (await transaction.select({ code: kakaoFormSnapshots.code }).from(kakaoFormSnapshots).where(matchesState).limit(1))[0];
  if (existing) return existing.code;

  // ON CONFLICT also handles concurrent issuance of an identical original. A rare
  // random-code collision retries without poisoning the surrounding transaction.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inserted = (await transaction.insert(kakaoFormSnapshots).values({
      code: newCode(), kind: input.kind, scopeHash: input.scopeHash, targetId: input.targetId,
      operatingDate: input.operatingDate, stateHash, stateJson: input.state,
      createdAt: input.now, expiresAt,
    }).onConflictDoNothing().returning({ code: kakaoFormSnapshots.code }))[0];
    if (inserted) return inserted.code;
    const concurrent = (await transaction.select({ code: kakaoFormSnapshots.code }).from(kakaoFormSnapshots).where(matchesState).limit(1))[0];
    if (concurrent) return concurrent.code;
  }
  throw new Error("KAKAO_FORM_SNAPSHOT_CODE_UNAVAILABLE");
}

/** A code is useful only after the caller separately authorizes and locks its target. */
export async function loadKakaoFormSnapshot(
  transaction: V2Transaction,
  input: SnapshotBinding & Readonly<{ code: string }>,
): Promise<JsonObject | null> {
  if (!validBinding(input) || input.operatingDate !== recruitingOperatingDateKey(input.now)) return null;
  const code = normalizeKakaoFormSnapshotCode(input.code);
  if (!code) return null;
  await pruneExpiredKakaoFormSnapshots(transaction, input.now);
  const row = (await transaction.select({ state: kakaoFormSnapshots.stateJson }).from(kakaoFormSnapshots).where(and(
    eq(kakaoFormSnapshots.code, code), eq(kakaoFormSnapshots.kind, input.kind),
    eq(kakaoFormSnapshots.scopeHash, input.scopeHash), eq(kakaoFormSnapshots.targetId, input.targetId),
    eq(kakaoFormSnapshots.operatingDate, input.operatingDate), gt(kakaoFormSnapshots.expiresAt, input.now),
  )).limit(1))[0];
  return row?.state ?? null;
}
