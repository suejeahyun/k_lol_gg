export const OPERATION_FORM_TYPES = ["friends", "leaves", "meetups", "suggestions"] as const;
export type OperationFormType = (typeof OPERATION_FORM_TYPES)[number];

export const OPERATION_FORM_STATUSES = ["PENDING", "IN_REVIEW", "COMPLETED", "REJECTED", "CANCELLED"] as const;
export type OperationFormStatus = (typeof OPERATION_FORM_STATUSES)[number];

export type FriendsFormPayload = Readonly<{
  applicantName: string;
  applicantNickname: string;
  friendName: string;
  friendNickname: string;
  usagePeriod: string;
  discordNicknameChange: boolean;
}>;

export type LeavesFormPayload = Readonly<{
  applicantName: string;
  applicantNickname: string;
  periodStart: string | null;
  periodEnd: string | null;
  legacyPeriodText?: string | null;
  reason: string;
  scope: string;
}>;

export type MeetupsFormPayload = Readonly<{
  hostName: string;
  hostNickname: string;
  meetupAt: string | null;
  legacyDateText?: string | null;
  location: string;
  participants: readonly string[];
}>;

export type SuggestionsFormPayload = Readonly<{
  applicantName: string;
  applicantNickname: string;
  reason: string;
  content: string;
}>;

export type OperationFormPayloadByType = Readonly<{
  friends: FriendsFormPayload;
  leaves: LeavesFormPayload;
  meetups: MeetupsFormPayload;
  suggestions: SuggestionsFormPayload;
}>;

export type OperationForm<T extends OperationFormType = OperationFormType> = Readonly<{
  id: string;
  revision: number;
  formType: T;
  status: OperationFormStatus;
  payload: OperationFormPayloadByType[T];
  submittedAt: string;
  updatedAt: string;
  adminNote: string | null;
  reviewedByUserAccountId: string | null;
  reviewedAt: string | null;
  deletedAt: string | null;
  deletedByUserAccountId: string | null;
  deletionReason: string | null;
}>;

export type OperationFormErrorCode =
  | "INVALID_FORM_TYPE"
  | "INVALID_FORM_PAYLOAD"
  | "INVALID_FORM_STATUS"
  | "INVALID_FORM_TRANSITION"
  | "INVALID_ADMIN_NOTE"
  | "INVALID_DELETE_REASON"
  | "FORM_ALREADY_DELETED"
  | "STALE_FORM_REVISION";

export class OperationFormError extends Error {
  constructor(readonly code: OperationFormErrorCode) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") throw new OperationFormError("INVALID_FORM_PAYLOAD");
  const normalized = value.normalize("NFKC").trim().replace(/\r\n?/gu, "\n");
  if (normalized.length < 1 || normalized.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) {
    throw new OperationFormError("INVALID_FORM_PAYLOAD");
  }
  return normalized;
}

function calendarDate(value: unknown) {
  const normalized = boundedText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new OperationFormError("INVALID_FORM_PAYLOAD");
  }
  return normalized;
}

function instant(value: unknown) {
  const normalized = boundedText(value, 40);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime()) || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(normalized)) {
    throw new OperationFormError("INVALID_FORM_PAYLOAD");
  }
  return parsed.toISOString();
}

export function isOperationFormType(value: unknown): value is OperationFormType {
  return typeof value === "string" && (OPERATION_FORM_TYPES as readonly string[]).includes(value);
}

export function isOperationFormStatus(value: unknown): value is OperationFormStatus {
  return typeof value === "string" && (OPERATION_FORM_STATUSES as readonly string[]).includes(value);
}

export function parseOperationFormPayload<T extends OperationFormType>(formType: T, value: unknown): OperationFormPayloadByType[T] {
  if (!isRecord(value)) throw new OperationFormError("INVALID_FORM_PAYLOAD");
  let parsed: OperationFormPayloadByType[OperationFormType];
  if (formType === "friends") {
    const keys = ["applicantName", "applicantNickname", "friendName", "friendNickname", "usagePeriod", "discordNicknameChange"];
    if (!hasExactKeys(value, keys) || typeof value.discordNicknameChange !== "boolean") throw new OperationFormError("INVALID_FORM_PAYLOAD");
    parsed = Object.freeze({
      applicantName: boundedText(value.applicantName, 100), applicantNickname: boundedText(value.applicantNickname, 64),
      friendName: boundedText(value.friendName, 100), friendNickname: boundedText(value.friendNickname, 64),
      usagePeriod: boundedText(value.usagePeriod, 160), discordNicknameChange: value.discordNicknameChange,
    });
  } else if (formType === "leaves") {
    const keys = ["applicantName", "applicantNickname", "periodStart", "periodEnd", "reason", "scope"];
    const legacyKeys = [...keys, "legacyPeriodText"];
    if (!hasExactKeys(value, keys) && !hasExactKeys(value, legacyKeys)) throw new OperationFormError("INVALID_FORM_PAYLOAD");
    const legacyPeriodText = "legacyPeriodText" in value ? boundedText(value.legacyPeriodText, 160) : null;
    const periodStart = value.periodStart === null && legacyPeriodText ? null : calendarDate(value.periodStart);
    const periodEnd = value.periodEnd === null && legacyPeriodText ? null : calendarDate(value.periodEnd);
    if (periodStart && periodEnd && periodEnd < periodStart) throw new OperationFormError("INVALID_FORM_PAYLOAD");
    parsed = Object.freeze({
      applicantName: boundedText(value.applicantName, 100), applicantNickname: boundedText(value.applicantNickname, 64),
      periodStart, periodEnd, legacyPeriodText, reason: boundedText(value.reason, 1_000), scope: boundedText(value.scope, 160),
    });
  } else if (formType === "meetups") {
    const keys = ["hostName", "hostNickname", "meetupAt", "location", "participants"];
    const legacyKeys = [...keys, "legacyDateText"];
    if ((!hasExactKeys(value, keys) && !hasExactKeys(value, legacyKeys)) || !Array.isArray(value.participants) || value.participants.length < 1 || value.participants.length > 30) {
      throw new OperationFormError("INVALID_FORM_PAYLOAD");
    }
    const participants = value.participants.map((entry) => boundedText(entry, 100));
    if (new Set(participants).size !== participants.length) throw new OperationFormError("INVALID_FORM_PAYLOAD");
    const legacyDateText = "legacyDateText" in value ? boundedText(value.legacyDateText, 160) : null;
    const meetupAt = value.meetupAt === null && legacyDateText ? null : instant(value.meetupAt);
    parsed = Object.freeze({
      hostName: boundedText(value.hostName, 100), hostNickname: boundedText(value.hostNickname, 64),
      meetupAt, legacyDateText, location: boundedText(value.location, 240), participants: Object.freeze(participants),
    });
  } else {
    const keys = ["applicantName", "applicantNickname", "reason", "content"];
    if (!hasExactKeys(value, keys)) throw new OperationFormError("INVALID_FORM_PAYLOAD");
    parsed = Object.freeze({
      applicantName: boundedText(value.applicantName, 100), applicantNickname: boundedText(value.applicantNickname, 64),
      reason: boundedText(value.reason, 500), content: boundedText(value.content, 4_000),
    });
  }
  return parsed as OperationFormPayloadByType[T];
}

const allowedTransitions: Readonly<Record<OperationFormStatus, readonly OperationFormStatus[]>> = Object.freeze({
  PENDING: ["PENDING", "IN_REVIEW", "COMPLETED", "REJECTED", "CANCELLED"],
  IN_REVIEW: ["IN_REVIEW", "COMPLETED", "REJECTED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
  REJECTED: ["REJECTED"],
  CANCELLED: ["CANCELLED"],
});

export function reviewOperationForm(input: Readonly<{
  form: OperationForm;
  expectedRevision: number;
  status?: unknown;
  adminNote?: unknown;
  reviewerUserAccountId: string;
  now: Date;
}>): OperationForm {
  if (input.form.deletedAt) throw new OperationFormError("FORM_ALREADY_DELETED");
  if (input.form.revision !== input.expectedRevision) throw new OperationFormError("STALE_FORM_REVISION");
  const status = input.status === undefined ? input.form.status : input.status;
  if (!isOperationFormStatus(status)) throw new OperationFormError("INVALID_FORM_STATUS");
  if (!allowedTransitions[input.form.status].includes(status)) throw new OperationFormError("INVALID_FORM_TRANSITION");
  const adminNote = input.adminNote === undefined ? input.form.adminNote : input.adminNote === null ? null : boundedText(input.adminNote, 2_000);
  const now = input.now.toISOString();
  return Object.freeze({ ...input.form, revision: input.form.revision + 1, status, adminNote, reviewedByUserAccountId: input.reviewerUserAccountId, reviewedAt: now, updatedAt: now });
}

export function softDeleteOperationForm(input: Readonly<{
  form: OperationForm;
  expectedRevision: number;
  reason: unknown;
  deletedByUserAccountId: string;
  now: Date;
}>): OperationForm {
  if (input.form.deletedAt) throw new OperationFormError("FORM_ALREADY_DELETED");
  if (input.form.revision !== input.expectedRevision) throw new OperationFormError("STALE_FORM_REVISION");
  let reason: string;
  try { reason = boundedText(input.reason, 500); } catch { throw new OperationFormError("INVALID_DELETE_REASON"); }
  const now = input.now.toISOString();
  return Object.freeze({
    ...input.form, revision: input.form.revision + 1, updatedAt: now, deletedAt: now,
    deletedByUserAccountId: input.deletedByUserAccountId, deletionReason: reason,
  });
}

export type AdminOperationFormDto = Readonly<{
  id: string;
  revision: number;
  formType: OperationFormType;
  status: OperationFormStatus;
  payload: OperationFormPayloadByType[OperationFormType];
  submittedAt: string;
  updatedAt: string;
  adminNote: string | null;
  reviewedAt: string | null;
}>;

export function toAdminOperationFormDto(form: OperationForm): AdminOperationFormDto {
  return Object.freeze({
    id: form.id, revision: form.revision, formType: form.formType, status: form.status,
    payload: form.payload, submittedAt: form.submittedAt, updatedAt: form.updatedAt,
    adminNote: form.adminNote, reviewedAt: form.reviewedAt,
  });
}
