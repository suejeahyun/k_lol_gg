import { createHash } from "node:crypto";

import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";

import type {
  CreateTeamBalanceDraftInput,
  SelectTeamBalanceCandidateInput,
  TeamBalanceCommandEnvelope,
  TeamBalanceDraftListQuery,
  TeamBalanceRepository,
  TeamBalanceViewer,
} from "./ports/team-balance-repository";
import {
  calculateTeamBalanceCandidates,
  TEAM_BALANCE_POSITIONS,
  TEAM_BALANCE_PREFERENCES,
  type TeamBalanceEligibility,
  type TeamBalanceLayoutEntry,
} from "../domain/team-balance";
import {
  canonicalTeamBalanceJson,
  TeamBalanceServiceError,
  type TeamBalanceDraftAuthorization,
} from "../domain/team-balance-draft";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unsafeTextPattern = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export type TeamBalanceCommandContext = Readonly<{
  actorSession: TransactionSessionActor;
  authorization: TeamBalanceDraftAuthorization;
  idempotencyMaterial: Uint8Array;
  requestId: string;
}>;

function objectBody(value: unknown, allowedKeys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "요청 값이 올바르지 않습니다.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "허용되지 않은 요청 항목입니다.");
  }
  return record;
}

function uuid(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "식별자가 올바르지 않습니다.");
  }
  return value.toLocaleLowerCase("en-US");
}

function title(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().normalize("NFKC").replace(/\s+/gu, " ") : "";
  if (!normalized || normalized.length > 120 || unsafeTextPattern.test(normalized)) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "초안 이름은 1~120자로 입력해 주세요.");
  }
  return normalized;
}

function eligibility(value: unknown): readonly TeamBalanceEligibility[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "가능 포지션을 1~5개 선택해 주세요.");
  }
  return value.map((entry) => {
    const record = objectBody(entry, ["position", "preference"]);
    if (
      !TEAM_BALANCE_POSITIONS.includes(record.position as never) ||
      !TEAM_BALANCE_PREFERENCES.includes(record.preference as never)
    ) {
      throw new TeamBalanceServiceError("INVALID_INPUT", "포지션 선호 값이 올바르지 않습니다.");
    }
    return {
      position: record.position as TeamBalanceEligibility["position"],
      preference: record.preference as TeamBalanceEligibility["preference"],
    };
  });
}

function createInput(value: unknown): CreateTeamBalanceDraftInput {
  const body = objectBody(value, ["title", "participants"]);
  if (!Array.isArray(body.participants) || body.participants.length !== 10) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "참가자는 정확히 10명이어야 합니다.");
  }
  const participants = body.participants.map((entry) => {
    const record = objectBody(entry, ["playerId", "eligiblePositions"]);
    return { playerId: uuid(record.playerId), eligiblePositions: eligibility(record.eligiblePositions) };
  });
  try {
    calculateTeamBalanceCandidates(
      participants.map((participant) => ({ ...participant, rating: null })),
      1,
    );
  } catch {
    throw new TeamBalanceServiceError("INVALID_INPUT", "10명의 포지션 조합을 확인해 주세요.");
  }
  return { title: title(body.title), participants };
}

function selection(value: unknown): SelectTeamBalanceCandidateInput {
  const body = objectBody(value, ["candidateRank", "layout"]);
  const hasRank = Object.hasOwn(body, "candidateRank");
  const hasLayout = Object.hasOwn(body, "layout");
  if (hasRank === hasLayout) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "자동 후보 또는 수동 배치 중 하나를 선택해 주세요.");
  }
  if (hasRank) {
    if (body.candidateRank !== 1 && body.candidateRank !== 2 && body.candidateRank !== 3) {
      throw new TeamBalanceServiceError("INVALID_INPUT", "자동 후보 순위가 올바르지 않습니다.");
    }
    return { kind: "AUTO", rank: body.candidateRank };
  }
  if (!Array.isArray(body.layout) || body.layout.length !== 10) {
    throw new TeamBalanceServiceError("INVALID_INPUT", "수동 배치는 정확히 10명이어야 합니다.");
  }
  const layout: TeamBalanceLayoutEntry[] = body.layout.map((entry) => {
    const record = objectBody(entry, ["playerId", "team", "position"]);
    if (
      (record.team !== "BLUE" && record.team !== "RED") ||
      !TEAM_BALANCE_POSITIONS.includes(record.position as never)
    ) {
      throw new TeamBalanceServiceError("INVALID_INPUT", "수동 팀 또는 포지션 값이 올바르지 않습니다.");
    }
    return {
      playerId: uuid(record.playerId),
      team: record.team,
      position: record.position as TeamBalanceLayoutEntry["position"],
    };
  });
  return { kind: "MANUAL", layout };
}

function digest(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest();
}

function envelope(
  context: TeamBalanceCommandContext,
  scope: string,
  request: Record<string, unknown>,
): TeamBalanceCommandEnvelope {
  return {
    actorUserAccountId: context.actorSession.userAccountId,
    actorSession: context.actorSession,
    authorization: context.authorization,
    requestId: uuid(context.requestId),
    scope,
    keyHash: digest(context.idempotencyMaterial),
    requestHash: digest(`${scope}\0${canonicalTeamBalanceJson(request)}`),
  };
}

function emptyBody(value: unknown) {
  objectBody(value, []);
}

export class TeamBalanceService {
  constructor(private readonly repository: TeamBalanceRepository) {}

  getDraft(viewer: TeamBalanceViewer, draftId: string) {
    return this.repository.getDraft(viewer, uuid(draftId));
  }

  listDrafts(viewer: TeamBalanceViewer, query: TeamBalanceDraftListQuery) {
    if (
      !Number.isSafeInteger(query.page) ||
      !Number.isSafeInteger(query.pageSize) ||
      query.page < 1 ||
      query.page > 100 ||
      query.pageSize < 1 ||
      query.pageSize > 50
    ) {
      throw new TeamBalanceServiceError("INVALID_INPUT", "목록 페이지 값이 올바르지 않습니다.");
    }
    return this.repository.listDrafts(viewer, query);
  }

  createDraft(context: TeamBalanceCommandContext, body: unknown, now = new Date()) {
    if (context.authorization !== "APPROVED_ACCOUNT_MUTATION") {
      throw new TeamBalanceServiceError("FORBIDDEN", "승인된 사용자 계정만 초안을 만들 수 있습니다.");
    }
    const input = createInput(body);
    return this.repository.createDraft(
      envelope(context, "team-tools:drafts:create", input as unknown as Record<string, unknown>),
      input,
      now,
    );
  }

  selectCandidate(
    context: TeamBalanceCommandContext,
    draftId: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    const input = selection(body);
    const id = uuid(draftId);
    return this.repository.selectCandidate(
      envelope(context, "team-tools:drafts:select", { id, expectedRevision, input }),
      id,
      expectedRevision,
      input,
      now,
    );
  }

  saveDraft(
    context: TeamBalanceCommandContext,
    draftId: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    emptyBody(body);
    const id = uuid(draftId);
    return this.repository.saveDraft(
      envelope(context, "team-tools:drafts:save", { id, expectedRevision }),
      id,
      expectedRevision,
      now,
    );
  }

  reevaluateDraft(
    context: TeamBalanceCommandContext,
    draftId: string,
    expectedRevision: number,
    body: unknown,
    now = new Date(),
  ) {
    emptyBody(body);
    const id = uuid(draftId);
    return this.repository.reevaluateDraft(
      envelope(context, "team-tools:drafts:reevaluate", { id, expectedRevision }),
      id,
      expectedRevision,
      now,
    );
  }
}
