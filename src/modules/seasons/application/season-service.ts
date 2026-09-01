import { createHash } from "node:crypto";

import type {
  AdminWorkspaceQuery,
  CommandEnvelope,
  SeasonRepository,
} from "./ports/season-repository";
import {
  canonicalJson,
  isSeasonApplicationPosition,
  isSeasonApplicationStatus,
  kstDateKey,
  normalizeSeasonName,
  SeasonServiceError,
  type SeasonApplicationPosition,
} from "../domain/season";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SeasonCommandContext = Readonly<{
  actorUserAccountId: string;
  idempotencyMaterial: Uint8Array;
  requestId: string;
}>;

const unsafeTextPattern = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const zonedIsoPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

function objectBody(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new SeasonServiceError("INVALID_INPUT", "요청 값이 올바르지 않습니다.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new SeasonServiceError("INVALID_INPUT", "허용되지 않은 요청 항목이 포함되어 있습니다.");
  }
  return record;
}

function text(value: unknown, maximumLength: number, required = false): string {
  const normalized = typeof value === "string" ? value.trim().normalize("NFKC") : "";
  if ((required && !normalized) || normalized.length > maximumLength || unsafeTextPattern.test(normalized)) {
    throw new SeasonServiceError("INVALID_INPUT", "입력 값의 길이나 형식을 확인해 주세요.");
  }
  return normalized;
}

function optionalDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 40 || unsafeTextPattern.test(value)) {
    throw new SeasonServiceError("INVALID_INPUT", "날짜 형식을 확인해 주세요.");
  }
  const match = zonedIsoPattern.exec(value);
  if (!match) throw new SeasonServiceError("INVALID_INPUT", "시간대가 포함된 ISO 날짜를 입력해 주세요.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", fraction = "0", zone, , offsetHourText = "0", offsetMinuteText = "0"] = match;
  const [year, month, day, hour, minute, second, millisecond, offsetHour, offsetMinute] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction.padEnd(3, "0"),
    offsetHourText,
    offsetMinuteText,
  ].map(Number);
  const calendarProbe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day ||
    calendarProbe.getUTCHours() !== hour ||
    calendarProbe.getUTCMinutes() !== minute ||
    calendarProbe.getUTCSeconds() !== second ||
    offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0) ||
    (zone === "Z" && (offsetHour !== 0 || offsetMinute !== 0))
  ) {
    throw new SeasonServiceError("INVALID_INPUT", "날짜 형식을 확인해 주세요.");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new SeasonServiceError("INVALID_INPUT", "날짜 형식을 확인해 주세요.");
  }
  return parsed;
}

const seasonFieldKeys = ["name", "applicationsOpenAt", "applicationsCloseAt", "startsAt", "endsAt"] as const;

function seasonFields(value: unknown, requireCompleteReplacement = false) {
  const body = objectBody(value, seasonFieldKeys);
  if (requireCompleteReplacement && seasonFieldKeys.some((key) => !Object.hasOwn(body, key))) {
    throw new SeasonServiceError("INVALID_INPUT", "시즌 편집 값은 모든 필드를 명시해야 합니다.");
  }
  const name = normalizeSeasonName(text(body.name, 120, true));
  const applicationsOpenAt = optionalDate(body.applicationsOpenAt);
  const applicationsCloseAt = optionalDate(body.applicationsCloseAt);
  const startsAt = optionalDate(body.startsAt);
  const endsAt = optionalDate(body.endsAt);

  if (applicationsOpenAt && applicationsCloseAt && applicationsCloseAt <= applicationsOpenAt) {
    throw new SeasonServiceError("INVALID_INPUT", "신청 종료는 시작보다 늦어야 합니다.");
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new SeasonServiceError("INVALID_INPUT", "시즌 종료는 시작보다 늦어야 합니다.");
  }

  return { name, applicationsOpenAt, applicationsCloseAt, startsAt, endsAt };
}

function positions(value: unknown, mainPosition: SeasonApplicationPosition) {
  if (!Array.isArray(value)) {
    throw new SeasonServiceError("INVALID_INPUT", "부라인은 배열로 입력해 주세요.");
  }
  const normalized: SeasonApplicationPosition[] = [];
  for (const candidate of value) {
    if (!isSeasonApplicationPosition(candidate)) {
      throw new SeasonServiceError("INVALID_INPUT", "허용되지 않은 라인이 포함되어 있습니다.");
    }
    if (candidate !== mainPosition && !normalized.includes(candidate)) normalized.push(candidate);
  }
  if (normalized.length > 5) {
    throw new SeasonServiceError("INVALID_INPUT", "부라인 선택 수를 확인해 주세요.");
  }
  if ((mainPosition === "ALL" && normalized.length > 0) || (mainPosition !== "ALL" && normalized.includes("ALL"))) {
    throw new SeasonServiceError("INVALID_INPUT", "전체 라인과 구체 라인은 함께 선택할 수 없습니다.");
  }
  return normalized;
}

function digest(value: Uint8Array | string): Buffer {
  return createHash("sha256").update(value).digest();
}

function envelope(
  context: SeasonCommandContext,
  scope: string,
  request: Record<string, unknown>,
): CommandEnvelope {
  if (!uuidPattern.test(context.actorUserAccountId) || !uuidPattern.test(context.requestId)) {
    throw new SeasonServiceError("INVALID_INPUT", "요청 식별자가 올바르지 않습니다.");
  }
  return {
    actorUserAccountId: context.actorUserAccountId,
    requestId: context.requestId,
    scope,
    keyHash: digest(context.idempotencyMaterial),
    requestHash: digest(`${scope}\0${canonicalJson(request)}`),
  };
}

function assertUuid(value: string) {
  if (!uuidPattern.test(value)) {
    throw new SeasonServiceError("INVALID_INPUT", "리소스 식별자가 올바르지 않습니다.");
  }
}

export class SeasonService {
  constructor(private readonly repository: SeasonRepository) {}

  listPublicSeasons(now = new Date()) {
    return this.repository.listPublicSeasons(now);
  }

  getCurrentSeason(now = new Date()) {
    return this.repository.getCurrentSeason(now);
  }

  getApplicationHub(actorUserAccountId: string | null, now = new Date()) {
    if (actorUserAccountId) assertUuid(actorUserAccountId);
    return this.repository.getApplicationHub(actorUserAccountId, now);
  }

  getAdminWorkspace(query: AdminWorkspaceQuery) {
    return this.repository.getAdminWorkspace(query);
  }

  createSeason(context: SeasonCommandContext, body: unknown, now = new Date()) {
    const input = seasonFields(body);
    return this.repository.createSeason(
      envelope(context, "admin:seasons:create", {
        ...input,
        applicationsOpenAt: input.applicationsOpenAt?.toISOString() ?? null,
        applicationsCloseAt: input.applicationsCloseAt?.toISOString() ?? null,
        startsAt: input.startsAt?.toISOString() ?? null,
        endsAt: input.endsAt?.toISOString() ?? null,
      }),
      input,
      now,
    );
  }

  updateSeason(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    const fields = seasonFields(body, true);
    const input = { id, expectedRevision, ...fields };
    return this.repository.updateSeason(
      envelope(context, "admin:seasons:update", {
        id,
        expectedRevision,
        ...fields,
        applicationsOpenAt: fields.applicationsOpenAt?.toISOString() ?? null,
        applicationsCloseAt: fields.applicationsCloseAt?.toISOString() ?? null,
        startsAt: fields.startsAt?.toISOString() ?? null,
        endsAt: fields.endsAt?.toISOString() ?? null,
      }),
      input,
      now,
    );
  }

  activateSeason(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    objectBody(body, []);
    return this.repository.activateSeason(
      envelope(context, "admin:seasons:activate", { id, expectedRevision }),
      id,
      expectedRevision,
      now,
    );
  }

  endSeason(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    objectBody(body, []);
    return this.repository.endSeason(
      envelope(context, "admin:seasons:end", { id, expectedRevision }),
      id,
      expectedRevision,
      now,
    );
  }

  cloneSeason(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    const parsed = objectBody(body, ["name"]);
    const name = normalizeSeasonName(text(parsed.name, 120));
    return this.repository.cloneSeason(
      envelope(context, "admin:seasons:clone", { id, name, expectedRevision }),
      id,
      name,
      expectedRevision,
      now,
    );
  }

  retireSeason(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    objectBody(body, []);
    return this.repository.retireSeason(
      envelope(context, "admin:seasons:retire", { id, expectedRevision }),
      id,
      expectedRevision,
      now,
    );
  }

  upsertOwnApplication(
    context: SeasonCommandContext,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    const parsed = objectBody(body, ["mainPosition", "subPositions"]);
    if (!isSeasonApplicationPosition(parsed.mainPosition)) {
      throw new SeasonServiceError("INVALID_INPUT", "주라인을 선택해 주세요.");
    }
    const mainPosition = parsed.mainPosition;
    const subPositions = positions(parsed.subPositions, mainPosition);
    const input = {
      actorUserAccountId: context.actorUserAccountId,
      applyDate: kstDateKey(now),
      expectedRevision,
      mainPosition,
      subPositions,
    };
    return this.repository.upsertOwnApplication(
      envelope(context, "applications:season:upsert", input),
      input,
      now,
    );
  }

  cancelOwnApplication(
    context: SeasonCommandContext,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    objectBody(body, []);
    const applyDate = kstDateKey(now);
    return this.repository.cancelOwnApplication(
      envelope(context, "applications:season:cancel", { applyDate, expectedRevision }),
      expectedRevision,
      applyDate,
      now,
    );
  }

  reviewApplication(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    const parsed = objectBody(body, ["status", "reviewNote"]);
    if (
      !isSeasonApplicationStatus(parsed.status) ||
      parsed.status === "APPLIED" ||
      parsed.status === "CANCELLED"
    ) {
      throw new SeasonServiceError("INVALID_INPUT", "검토 상태를 확인해 주세요.");
    }
    const reviewNote = text(parsed.reviewNote, 1_000) || null;
    const input = { id, expectedRevision, status: parsed.status, reviewNote };
    return this.repository.reviewApplication(
      envelope(context, "admin:season-applications:review", input),
      input,
      now,
    );
  }
}
