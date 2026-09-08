import { createHash } from "node:crypto";
import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type {
  AdminWorkspaceQuery,
  AdminKakaoPendingQuery,
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
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export type SeasonCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
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
  authorization: CommandEnvelope["authorization"],
  scope: string,
  request: Record<string, unknown>,
): CommandEnvelope {
  if (!uuidPattern.test(context.actorSession.userAccountId) || !uuidPattern.test(context.requestId)) {
    throw new SeasonServiceError("INVALID_INPUT", "요청 식별자가 올바르지 않습니다.");
  }
  return {
    actorUserAccountId: context.actorSession.userAccountId,
    actorSession: context.actorSession,
    authorization,
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

function positiveRecruitNo(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 999) {
    throw new SeasonServiceError("INVALID_INPUT", "모집 회차는 1부터 999 사이의 정수여야 합니다.");
  }
  return value;
}

function assertDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (!dateKeyPattern.test(value) || probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new SeasonServiceError("INVALID_INPUT", "신청 날짜 형식을 확인해 주세요.");
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

  getApplicationHub(actorUserAccountId: string | null, recruitNoOrNow: number | Date = 1, now = new Date()) {
    if (actorUserAccountId) assertUuid(actorUserAccountId);
    const recruitNo = recruitNoOrNow instanceof Date ? 1 : positiveRecruitNo(recruitNoOrNow);
    return this.repository.getApplicationHub(actorUserAccountId, recruitNoOrNow instanceof Date ? recruitNoOrNow : now, recruitNo);
  }

  getAdminWorkspace(query: AdminWorkspaceQuery) {
    return this.repository.getAdminWorkspace(query);
  }

  getKakaoPendingApplications(query: AdminKakaoPendingQuery) {
    return this.repository.getKakaoPendingApplications(query);
  }

  getKakaoPendingApplication(id: string, candidateQuery = "") {
    assertUuid(id);
    const query = text(candidateQuery, 80);
    return this.repository.getKakaoPendingApplication(id, query);
  }

  getConfirmedApplicationsForTeamBalance(seasonId: string, applyDate: string, recruitNo: number) {
    assertUuid(seasonId);
    assertDateKey(applyDate);
    return this.repository.getConfirmedApplicationsForTeamBalance(
      seasonId,
      applyDate,
      positiveRecruitNo(recruitNo),
    );
  }

  createSeason(context: SeasonCommandContext, body: unknown, now = new Date()) {
    const input = seasonFields(body);
    return this.repository.createSeason(
      envelope(context, "ADMIN_MUTATION", "admin:seasons:create", {
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
      envelope(context, "ADMIN_MUTATION", "admin:seasons:update", {
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
      envelope(context, "ADMIN_MUTATION", "admin:seasons:activate", { id, expectedRevision }),
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
      envelope(context, "ADMIN_MUTATION", "admin:seasons:end", { id, expectedRevision }),
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
      envelope(context, "ADMIN_MUTATION", "admin:seasons:clone", { id, name, expectedRevision }),
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
      envelope(context, "ADMIN_MUTATION", "admin:seasons:retire", { id, expectedRevision }),
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
    const parsed = objectBody(body, ["mainPosition", "subPositions", "recruitNo"]);
    if (!isSeasonApplicationPosition(parsed.mainPosition)) {
      throw new SeasonServiceError("INVALID_INPUT", "주라인을 선택해 주세요.");
    }
    const mainPosition = parsed.mainPosition;
    const subPositions = positions(parsed.subPositions, mainPosition);
    const input = {
      actorUserAccountId: context.actorSession.userAccountId,
      applyDate: kstDateKey(now),
      recruitNo: positiveRecruitNo(parsed.recruitNo ?? 1),
      expectedRevision,
      mainPosition,
      subPositions,
    };
    return this.repository.upsertOwnApplication(
      envelope(context, "APPROVED_ACCOUNT_MUTATION", "applications:season:upsert", input),
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
    const parsed = objectBody(body, ["recruitNo"]);
    const applyDate = kstDateKey(now);
    const recruitNo = positiveRecruitNo(parsed.recruitNo ?? 1);
    return this.repository.cancelOwnApplication(
      envelope(context, "APPROVED_ACCOUNT_MUTATION", "applications:season:cancel", { applyDate, recruitNo, expectedRevision }),
      expectedRevision,
      applyDate,
      recruitNo,
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
      envelope(context, "ADMIN_MUTATION", "admin:season-applications:review", input),
      input,
      now,
    );
  }


  resolveKakaoPendingApplication(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    const parsed = objectBody(body, ["playerId", "applicationStatus"]);
    const playerId = text(parsed.playerId, 36, true);
    assertUuid(playerId);
    if (parsed.applicationStatus !== "APPLIED" && parsed.applicationStatus !== "RESERVE") {
      throw new SeasonServiceError("INVALID_INPUT", "반영할 신청 상태를 확인해 주세요.");
    }
    const applicationStatus: "APPLIED" | "RESERVE" = parsed.applicationStatus;
    const input = { id, expectedRevision, playerId, applicationStatus };
    return this.repository.resolveKakaoPendingApplication(
      envelope(context, "SUPER_ADMIN_MUTATION", "admin:season-kakao-pending:resolve", input),
      input,
      now,
    );
  }

  cancelKakaoPendingApplication(
    context: SeasonCommandContext,
    id: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    assertUuid(id);
    objectBody(body, []);
    return this.repository.cancelKakaoPendingApplication(
      envelope(context, "SUPER_ADMIN_MUTATION", "admin:season-kakao-pending:cancel", { id, expectedRevision }),
      id,
      expectedRevision,
      now,
    );
  }
}
