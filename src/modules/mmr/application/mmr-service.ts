import { createHash } from "node:crypto";

import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import { MMR_POSITIONS, type MmrPosition } from "../domain/mmr-projection";
import { isMmrUuid } from "./mmr-query";
import type { MmrAdjustmentInput, MmrCommandEnvelope, MmrRepository } from "./ports/mmr-repository";

export type MmrServiceErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_MISMATCH"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PRECONDITION_FAILED"
  | "SESSION_STALE";

export class MmrServiceError extends Error {
  constructor(readonly code: MmrServiceErrorCode, message: string) {
    super(message);
    this.name = "MmrServiceError";
  }
}

export type MmrCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
  requestId: string;
  idempotencyMaterial: Uint8Array;
}>;

function digest(value: Uint8Array | string): Buffer {
  return createHash("sha256").update(value).digest();
}

function envelope(context: MmrCommandContext, scope: string, request: string): MmrCommandEnvelope {
  if (!isMmrUuid(context.requestId)) throw new MmrServiceError("INVALID_INPUT", "요청 식별자가 올바르지 않습니다.");
  return {
    actorSession: context.actorSession,
    requestId: context.requestId.toLocaleLowerCase("en-US"),
    scope,
    keyHash: digest(context.idempotencyMaterial),
    requestHash: digest(`${scope}\0${request}`),
  };
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new MmrServiceError("INVALID_INPUT", "요청 값이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function adjustment(value: unknown): MmrAdjustmentInput {
  const body = plainObject(value);
  const allowed = ["playerId", "position", "deltaBp", "reasonCode", "publicNote"];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.playerId !== "string" || !isMmrUuid(body.playerId)) {
    throw new MmrServiceError("INVALID_INPUT", "플레이어 식별자가 올바르지 않습니다.");
  }
  const position = body.position === null
    ? null
    : typeof body.position === "string" && MMR_POSITIONS.includes(body.position as MmrPosition)
      ? body.position as MmrPosition
      : undefined;
  if (position === undefined || !Number.isSafeInteger(body.deltaBp) || Number(body.deltaBp) < -1_000 || Number(body.deltaBp) > 1_000) {
    throw new MmrServiceError("INVALID_INPUT", "포지션 또는 조정값이 올바르지 않습니다.");
  }
  const reasonCode = typeof body.reasonCode === "string" ? body.reasonCode.trim().toLocaleUpperCase("en-US") : "";
  const publicNote = typeof body.publicNote === "string" ? body.publicNote.trim().normalize("NFKC").replace(/\s+/gu, " ") : "";
  if (!/^[A-Z][A-Z0-9_]{0,63}$/u.test(reasonCode) || publicNote.length < 1 || publicNote.length > 300 || /[\u0000-\u001f\u007f]/u.test(publicNote)) {
    throw new MmrServiceError("INVALID_INPUT", "조정 사유와 공개 설명을 확인해 주세요.");
  }
  return { playerId: body.playerId.toLocaleLowerCase("en-US"), position, deltaBp: Number(body.deltaBp), reasonCode, publicNote };
}

export class MmrService {
  constructor(private readonly repository: MmrRepository) {}

  getSummary() { return this.repository.getSummary(); }
  listPlayers(query: Parameters<MmrRepository["listPlayers"]>[0]) { return this.repository.listPlayers(query); }
  getPlayer(playerId: string) {
    if (!isMmrUuid(playerId)) throw new MmrServiceError("INVALID_INPUT", "플레이어 식별자가 올바르지 않습니다.");
    return this.repository.getPlayer(playerId.toLocaleLowerCase("en-US"));
  }
  listAdjustments(page: number, pageSize: number) { return this.repository.listAdjustments(page, pageSize); }

  recalculate(context: MmrCommandContext, expectedGeneration: number, body: unknown, now = new Date()) {
    const value = plainObject(body);
    if (Object.keys(value).length > 0 || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new MmrServiceError("INVALID_INPUT", "현재 generation과 빈 요청 본문을 확인해 주세요.");
    }
    return this.repository.recalculate(
      envelope(context, "admin:mmr:recalculate", String(expectedGeneration)),
      expectedGeneration,
      now,
    );
  }

  addAdjustment(context: MmrCommandContext, expectedGeneration: number, body: unknown, now = new Date()) {
    if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new MmrServiceError("INVALID_INPUT", "현재 generation을 확인해 주세요.");
    }
    const input = adjustment(body);
    return this.repository.addAdjustment(
      envelope(context, "admin:mmr:adjust", `${expectedGeneration}\0${JSON.stringify(input)}`),
      expectedGeneration,
      input,
      now,
    );
  }

  catchUp(now = new Date()) { return this.repository.catchUp(now); }
}
