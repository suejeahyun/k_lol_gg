import { createHash } from "node:crypto";

import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type {
  StatisticsCommandRepository,
  StatisticsQueryRepository,
} from "./ports/statistics-query-repository";
import { isStatisticsUuid } from "./statistics-query";

export type StatisticsCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
  idempotencyMaterial: Uint8Array;
  requestId: string;
}>;

export type StatisticsServiceErrorCode =
  | "FORBIDDEN"
  | "IDEMPOTENCY_MISMATCH"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PRECONDITION_FAILED"
  | "SESSION_STALE";

export class StatisticsServiceError extends Error {
  constructor(readonly code: StatisticsServiceErrorCode, message: string) {
    super(message);
    this.name = "StatisticsServiceError";
  }
}

function digest(value: Uint8Array | string): Buffer {
  return createHash("sha256").update(value).digest();
}

function assertUuid(value: string): void {
  if (!isStatisticsUuid(value)) {
    throw new StatisticsServiceError("INVALID_INPUT", "리소스 식별자가 올바르지 않습니다.");
  }
}

function recalculateBody(value: unknown): Readonly<{ seasonId: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new StatisticsServiceError("INVALID_INPUT", "요청 값이 올바르지 않습니다.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "seasonId") || typeof record.seasonId !== "string") {
    throw new StatisticsServiceError("INVALID_INPUT", "seasonId만 정확히 입력해 주세요.");
  }
  assertUuid(record.seasonId);
  return { seasonId: record.seasonId };
}

export class StatisticsService {
  constructor(
    private readonly queries: StatisticsQueryRepository,
    private readonly commands?: StatisticsCommandRepository,
  ) {}

  listPublicSeasons() {
    return this.queries.listPublicSeasons();
  }

  findPublicPlayerIdForAccount(userAccountId: string) {
    assertUuid(userAccountId);
    return this.queries.findPublicPlayerIdForAccount(userAccountId);
  }

  getPublicSeasonRanking(seasonId: string | null, minimumParticipation = 10) {
    if (seasonId) assertUuid(seasonId);
    if (!Number.isSafeInteger(minimumParticipation) || minimumParticipation < 0 || minimumParticipation > 999) {
      throw new StatisticsServiceError("INVALID_INPUT", "최소 참여 횟수가 올바르지 않습니다.");
    }
    return this.queries.getPublicSeasonRanking(seasonId, minimumParticipation);
  }

  getPublicPlayerStatistics(playerId: string, seasonId: string | null) {
    assertUuid(playerId);
    if (seasonId) assertUuid(seasonId);
    return this.queries.getPublicPlayerStatistics(playerId, seasonId);
  }

  getAdminStatus(seasonId: string | null) {
    if (seasonId) assertUuid(seasonId);
    return this.queries.getAdminStatus(seasonId);
  }

  recalculateSeason(
    context: StatisticsCommandContext,
    expectedGeneration: number,
    body: unknown,
    now = new Date(),
  ) {
    if (!this.commands) throw new StatisticsServiceError("FORBIDDEN", "쓰기 저장소가 연결되지 않았습니다.");
    if (!isStatisticsUuid(context.requestId) || !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
      throw new StatisticsServiceError("INVALID_INPUT", "요청 식별자나 projection revision이 올바르지 않습니다.");
    }
    const input = recalculateBody(body);
    const scope = "admin:statistics:recalculate" as const;
    return this.commands.recalculateSeason(
      {
        actorSession: context.actorSession,
        requestId: context.requestId,
        scope,
        keyHash: digest(context.idempotencyMaterial),
        requestHash: digest(`${scope}\0${input.seasonId}\0${expectedGeneration}`),
      },
      input.seasonId,
      expectedGeneration,
      now,
    );
  }
}
