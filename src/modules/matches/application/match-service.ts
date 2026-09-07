import { createHash, createHmac } from "node:crypto";

import type { PrivateImageStorage, ScoreboardOcr } from "./ports/private-image-storage";
import type {
  AdminMatchQuery,
  MatchActor,
  MatchCommandEnvelope,
  MatchRepository,
  OwnSubmissionQuery,
  PrivateImageOcrReservationResult,
  PrivateImageUploadReservationResult,
  PublicMatchQuery,
} from "./ports/match-repository";
import {
  canonicalUuid,
  canonicalSubmissionPublicCode,
  hasExactKeys,
  MATCH_IMAGE_CONTENT_TYPES,
  MATCH_IMAGE_MAX_BYTES,
  MATCH_IMAGE_MAX_COUNT,
  MatchServiceError,
  parseAdminMatchImportInput,
  parseMatchRecordInput,
  parseReason,
  parseReviewedGames,
  parseReviewResultInput,
  parseSubmissionCreateInput,
  parseSubmissionUpdateInput,
  type MatchRecordInput,
} from "../domain/match";
import { validatePrivateScoreboardImage } from "../infrastructure/private-image";

export type MatchCommandContext = Readonly<{
  actor: MatchActor;
  requestId: string;
  idempotencyMaterial: Uint8Array;
  /** Raw trusted proxy-normalized network material; only a keyed digest is persisted. */
  rateLimitMaterial: Uint8Array;
}>;

export type SubmissionImageUploadDeclaration = Readonly<{
  submissionId: string;
  expectedRevision: number;
  gameNumber: number;
  contentType: string;
  byteSize: number;
  sha256Hex: string;
  originalFileName?: string | null;
}>;

export type MatchAdapterDeadlines = Readonly<{
  storageStageMs: number;
  storageReadMs: number;
  storageDeleteMs: number;
  ocrMs: number;
}>;

const DEFAULT_ADAPTER_DEADLINES: MatchAdapterDeadlines = Object.freeze({
  storageStageMs: 8_000,
  storageReadMs: 5_000,
  storageDeleteMs: 5_000,
  ocrMs: 12_000,
});

class MatchAdapterDeadlineError extends Error {
  constructor(readonly operation: string) {
    super(operation);
    this.name = "MatchAdapterDeadlineError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactEmptyObject(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 0;
}

function safeUploadOriginalName(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  return normalized.length >= 1 &&
    normalized.length <= 255 &&
    !/[\\/\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(
      normalized,
    )
    ? normalized
    : null;
}

function parseAdminRecord(value: unknown): MatchRecordInput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["seasonId", "title", "playedOn", "startedAt", "games"])
  ) {
    return null;
  }
  return parseMatchRecordInput({
    seasonId: value.seasonId,
    title: value.title,
    playedOn: value.playedOn,
    startedAt: value.startedAt,
    games: value.games,
  });
}

function safeOcrCandidate(value: unknown, gameNumber: number): Record<string, unknown> | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "provider",
      "providerRequestReferenceHash",
      "gameNumber",
      "needsHumanReview",
      "participants",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.provider !== "string" ||
    !/^[A-Z0-9_]{2,32}$/.test(value.provider) ||
    !(
      value.providerRequestReferenceHash === null ||
      (typeof value.providerRequestReferenceHash === "string" &&
        /^[0-9a-f]{64}$/.test(value.providerRequestReferenceHash))
    ) ||
    value.gameNumber !== gameNumber ||
    value.needsHumanReview !== true ||
    !Array.isArray(value.participants) ||
    value.participants.length > 10
  ) {
    return null;
  }
  const unsafeText = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u206f\ufeff]/u;
  const normalizedParticipants: Record<string, unknown>[] = [];
  for (const [index, participant] of value.participants.entries()) {
    const nickname = isRecord(participant) && typeof participant.nickname === "string"
      ? participant.nickname.normalize("NFKC").trim()
      : null;
    const championKey = isRecord(participant) && typeof participant.championKey === "string"
      ? participant.championKey.normalize("NFKC").trim().toLocaleLowerCase("en-US")
      : null;
    if (
      !isRecord(participant) ||
      !hasExactKeys(participant, [
        "slot",
        "nickname",
        "championKey",
        "team",
        "position",
        "kills",
        "deaths",
        "assists",
        "confidence",
      ]) ||
      participant.slot !== index + 1 ||
      !(participant.nickname === null || (nickname !== null && nickname.length >= 1 && nickname.length <= 64 && !unsafeText.test(nickname))) ||
      !(participant.championKey === null || (championKey !== null && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(championKey))) ||
      !(participant.team === null || participant.team === "BLUE" || participant.team === "RED") ||
      !(participant.position === null || ["TOP", "JGL", "MID", "ADC", "SUP"].includes(String(participant.position))) ||
      ![participant.kills, participant.deaths, participant.assists].every(
        (entry) => entry === null || (Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 999),
      ) ||
      typeof participant.confidence !== "number" ||
      !Number.isFinite(participant.confidence) ||
      participant.confidence < 0 ||
      participant.confidence > 1
    ) {
      return null;
    }
    normalizedParticipants.push({
      slot: index + 1,
      nickname,
      championKey,
      team: participant.team,
      position: participant.position,
      kills: participant.kills,
      deaths: participant.deaths,
      assists: participant.assists,
      confidence: participant.confidence,
    });
  }
  const candidate = {
    schemaVersion: 1,
    provider: value.provider,
    providerRequestReferenceHash: value.providerRequestReferenceHash,
    gameNumber,
    needsHumanReview: true,
    participants: normalizedParticipants,
  };
  const json = JSON.stringify(candidate);
  return Buffer.byteLength(json, "utf8") <= 64 * 1024 ? candidate : null;
}

export class MatchService {
  private readonly hmacPepper: Buffer;
  private readonly adapterDeadlines: MatchAdapterDeadlines;

  constructor(
    private readonly repository: MatchRepository,
    hmacPepper: Uint8Array,
    private readonly privateStorage: PrivateImageStorage | null = null,
    private readonly scoreboardOcr: ScoreboardOcr | null = null,
    adapterDeadlines: MatchAdapterDeadlines = DEFAULT_ADAPTER_DEADLINES,
  ) {
    this.hmacPepper = Buffer.from(hmacPepper);
    if (this.hmacPepper.length < 32) {
      throw new Error("Match mutation HMAC pepper must contain at least 32 bytes.");
    }
    if (Object.values(adapterDeadlines).some((value) => !Number.isInteger(value) || value < 1 || value > 60_000)) {
      throw new Error("Match adapter deadlines must be integer milliseconds between 1 and 60000.");
    }
    this.adapterDeadlines = adapterDeadlines;
  }

  private runAdapter<T>(
    operation: string,
    timeoutMs: number,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new MatchAdapterDeadlineError(operation);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
      void Promise.resolve()
        .then(() => run(controller.signal))
        .then(
          (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
          },
          (error: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
          },
        );
    });
  }

  private hmac(domain: string, ...parts: readonly (string | Uint8Array)[]) {
    const hmac = createHmac("sha256", this.hmacPepper).update(domain, "utf8");
    for (const part of parts) {
      const bytes = typeof part === "string" ? Buffer.from(part, "utf8") : Buffer.from(part);
      hmac.update(Buffer.from(String(bytes.byteLength), "ascii"));
      hmac.update(":", "ascii");
      hmac.update(bytes);
    }
    return hmac.digest();
  }

  private envelope(
    context: MatchCommandContext,
    scope: string,
    requestPayload: unknown,
  ): MatchCommandEnvelope {
    return {
      actor: context.actor,
      requestId: context.requestId,
      scope,
      keyHash: this.hmac("klol-v2:match:idempotency-key:v1", scope, context.idempotencyMaterial),
      requestHash: this.hmac(
        "klol-v2:match:idempotency-request:v1",
        scope,
        canonical(requestPayload),
      ),
    };
  }

  listPublic(query: PublicMatchQuery) {
    return this.repository.listPublic(query);
  }

  getPublic(matchId: string) {
    const id = canonicalUuid(matchId);
    return id ? this.repository.getPublic(id) : Promise.resolve(null);
  }

  getPublicIdByLegacyId(legacyId: number) {
    if (!Number.isSafeInteger(legacyId) || legacyId < 1) return Promise.resolve(null);
    return this.repository.getPublicIdByLegacyId(legacyId);
  }

  listOwnSubmissions(actorUserAccountId: string, query: OwnSubmissionQuery) {
    return this.repository.listOwnSubmissions(actorUserAccountId, query);
  }

  getOwnSubmission(actorUserAccountId: string, submissionId: string) {
    const id = canonicalUuid(submissionId);
    return id ? this.repository.getOwnSubmission(actorUserAccountId, id) : Promise.resolve(null);
  }

  getOwnSubmissionByPublicCode(actorUserAccountId: string, publicCodeValue: string) {
    const publicCode = canonicalSubmissionPublicCode(publicCodeValue);
    return publicCode
      ? this.repository.getOwnSubmissionByPublicCode(actorUserAccountId, publicCode)
      : Promise.resolve(null);
  }

  getAdminWorkspace(query: AdminMatchQuery) {
    return this.repository.getAdminWorkspace(query);
  }

  getAdminEditorCatalog(includePlayerIds: readonly string[] = []) {
    const ids = [...new Set(includePlayerIds.map(canonicalUuid))];
    if (ids.length > 90 || ids.some((id) => id === null)) {
      throw new MatchServiceError("INVALID_INPUT", "편집기에 포함할 플레이어 식별자가 올바르지 않습니다.");
    }
    return this.repository.getAdminEditorCatalog(ids as string[]);
  }

  searchAdminPlayerOptions(queryValue: string, includePlayerIds: readonly string[] = []) {
    const query = queryValue.normalize("NFKC").trim();
    const ids = [...new Set(includePlayerIds.map(canonicalUuid))];
    if (
      query.length < 2 ||
      query.length > 64 ||
      /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(query) ||
      (query.includes("#") && (query.split("#").length !== 2 || query.split("#").some((part) => part.length < 1))) ||
      ids.length > 10 ||
      ids.some((id) => id === null)
    ) {
      throw new MatchServiceError("INVALID_INPUT", "플레이어 검색 조건이 올바르지 않습니다.");
    }
    return this.repository.searchAdminPlayerOptions(query, ids as string[]);
  }

  getMatchSummaryIntegrity(afterValue: string | null, pageSize: number) {
    const after = afterValue === null ? null : canonicalUuid(afterValue);
    if (
      (afterValue !== null && !after) ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 500
    ) {
      throw new MatchServiceError("INVALID_INPUT", "무결성 검사 배치 조건이 올바르지 않습니다.");
    }
    return this.repository.getMatchSummaryIntegrity(after, pageSize);
  }

  getAdminMatch(matchId: string) {
    const id = canonicalUuid(matchId);
    return id ? this.repository.getAdminMatch(id) : Promise.resolve(null);
  }

  getAdminSubmission(submissionId: string) {
    const id = canonicalUuid(submissionId);
    return id ? this.repository.getAdminSubmission(id) : Promise.resolve(null);
  }

  private async readPrivateImageReference(
    reference: Awaited<ReturnType<MatchRepository["getAdminPrivateImage"]>>,
  ) {
    if (!reference) return null;
    if (!this.privateStorage || this.privateStorage.storageProvider !== reference.storageProvider) {
      throw new MatchServiceError(
        "PRIVATE_STORAGE_UNAVAILABLE",
        "비공개 이미지 저장소가 현재 런타임과 일치하지 않습니다.",
      );
    }
    let bytes: Uint8Array | null;
    try {
      bytes = await this.runAdapter(
        "PRIVATE_STORAGE_READ_TIMEOUT",
        this.adapterDeadlines.storageReadMs,
        (signal) => this.privateStorage!.read(reference.storageKey, signal),
      );
    } catch {
      throw new MatchServiceError("PRIVATE_STORAGE_UNAVAILABLE", "비공개 이미지를 읽을 수 없습니다.");
    }
    if (
      !bytes ||
      bytes.byteLength !== reference.byteSize ||
      !createHash("sha256").update(bytes).digest().equals(Buffer.from(reference.sha256))
    ) {
      throw new MatchServiceError(
        "PRIVATE_STORAGE_UNAVAILABLE",
        "비공개 이미지 원본이 없거나 무결성 확인에 실패했습니다.",
      );
    }
    return { bytes, contentType: reference.contentType } as const;
  }

  async getOwnPrivateImage(actorUserAccountId: string, submissionIdValue: string, imageIdValue: string) {
    const submissionId = canonicalUuid(submissionIdValue);
    const imageId = canonicalUuid(imageIdValue);
    if (!submissionId || !imageId) return null;
    return this.readPrivateImageReference(
      await this.repository.getOwnPrivateImage(actorUserAccountId, submissionId, imageId),
    );
  }

  async getAdminPrivateImage(submissionIdValue: string, imageIdValue: string) {
    const submissionId = canonicalUuid(submissionIdValue);
    const imageId = canonicalUuid(imageIdValue);
    if (!submissionId || !imageId) return null;
    return this.readPrivateImageReference(
      await this.repository.getAdminPrivateImage(submissionId, imageId),
    );
  }

  private ocrEnvelope(
    context: MatchCommandContext,
    submissionId: string,
    imageId: string,
    expectedRevision: number,
    body: unknown,
  ) {
    return this.envelope(
      context,
      `admin:match-submissions:${submissionId}:images:${imageId}:ocr`,
      { expectedRevision, body },
    );
  }

  async prepareSubmissionImageOcr(
    context: MatchCommandContext,
    submissionIdValue: string,
    imageIdValue: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const submissionId = canonicalUuid(submissionIdValue);
    const imageId = canonicalUuid(imageIdValue);
    if (
      !submissionId ||
      !imageId ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      !exactEmptyObject(body)
    ) {
      throw new MatchServiceError("INVALID_INPUT", "OCR 재분석 요청 구조가 올바르지 않습니다.");
    }
    if (context.actor.purpose !== "ADMIN") {
      throw new MatchServiceError("FORBIDDEN", "관리자 세션에서만 OCR을 재분석할 수 있습니다.");
    }
    const envelope = this.ocrEnvelope(context, submissionId, imageId, expectedRevision, body);
    const prepared = await this.repository.reservePrivateImageOcr(
      envelope,
      {
        submissionId,
        imageId,
        expectedRevision,
        accountRateLimitKeyHash: this.hmac(
          "klol-v2:match:rate-limit:ocr-account:v1",
          context.actor.userAccountId,
        ),
      },
      new Date(),
    );
    if (
      prepared.kind === "RESERVED" &&
      (!this.privateStorage || this.privateStorage.storageProvider !== prepared.reference.storageProvider)
    ) {
      await this.repository
        .failPrivateImageOcr(envelope, prepared.reservationId, "PRIVATE_STORAGE_UNAVAILABLE", new Date())
        .catch(() => undefined);
      throw new MatchServiceError("PRIVATE_STORAGE_UNAVAILABLE", "비공개 이미지 저장소가 준비되지 않았습니다.");
    }
    return prepared;
  }

  async finalizeSubmissionImageOcr(
    context: MatchCommandContext,
    prepared: Extract<PrivateImageOcrReservationResult, { kind: "RESERVED" }>,
    submissionIdValue: string,
    imageIdValue: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const submissionId = canonicalUuid(submissionIdValue);
    const imageId = canonicalUuid(imageIdValue);
    const reservationId = canonicalUuid(prepared.reservationId);
    if (!submissionId || !imageId || !reservationId || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "OCR 재분석 작업 구조가 올바르지 않습니다.");
    }
    const envelope = this.ocrEnvelope(context, submissionId, imageId, expectedRevision, body);
    let ocrResult:
      | { status: "SUCCEEDED"; candidate: Record<string, unknown> }
      | { status: "FAILED"; errorCode: string } = {
        status: "FAILED",
        errorCode: "OCR_SOURCE_UNAVAILABLE",
      };
    let image: { bytes: Uint8Array; contentType: "image/png" | "image/jpeg" | "image/webp" } | null = null;
    try {
      image = await this.readPrivateImageReference(prepared.reference);
    } catch { /* keep the review-first source unavailable result */ }
    try {
      const candidate = image && this.scoreboardOcr
        ? safeOcrCandidate(
            await this.runAdapter(
              "OCR_TIMEOUT",
              this.adapterDeadlines.ocrMs,
              (signal) => this.scoreboardOcr!.inspect({
                bytes: image.bytes,
                contentType: image.contentType,
                gameNumber: prepared.gameNumber,
                signal,
              }),
            ),
            prepared.gameNumber,
          )
        : null;
      if (image) {
        ocrResult = candidate
          ? { status: "SUCCEEDED", candidate }
          : {
              status: "FAILED",
              errorCode: this.scoreboardOcr ? "OCR_INVALID_OUTPUT" : "OCR_UNAVAILABLE",
            };
      }
    } catch (error) {
      ocrResult = {
        status: "FAILED",
        errorCode: error instanceof MatchAdapterDeadlineError ? "OCR_TIMEOUT" : "OCR_UNAVAILABLE",
      };
    }
    return this.repository.finalizePrivateImageOcr(
      envelope,
      reservationId,
      ocrResult,
      new Date(),
    );
  }

  async failSubmissionImageOcrReservation(
    context: MatchCommandContext,
    reservationIdValue: string,
    submissionIdValue: string,
    imageIdValue: string,
    expectedRevision: number,
    body: unknown,
    failureCode: string,
  ) {
    const submissionId = canonicalUuid(submissionIdValue);
    const imageId = canonicalUuid(imageIdValue);
    const reservationId = canonicalUuid(reservationIdValue);
    if (!submissionId || !imageId || !reservationId || !exactEmptyObject(body)) return;
    await this.repository.failPrivateImageOcr(
      this.ocrEnvelope(context, submissionId, imageId, expectedRevision, body),
      reservationId,
      failureCode,
      new Date(),
    );
  }

  createMatch(context: MatchCommandContext, body: unknown) {
    const input = parseAdminRecord(body);
    if (!input) throw new MatchServiceError("INVALID_INPUT", "경기 입력 구조가 올바르지 않습니다.");
    return this.repository.createMatch(this.envelope(context, "admin:matches:create", body), input, new Date());
  }

  updateMatch(context: MatchCommandContext, matchId: string, expectedRevision: number, body: unknown) {
    const input = parseAdminRecord(body);
    const id = canonicalUuid(matchId);
    if (!id || !input) {
      throw new MatchServiceError("INVALID_INPUT", "경기 식별자 또는 입력 구조가 올바르지 않습니다.");
    }
    return this.repository.updateMatch(
      this.envelope(context, `admin:matches:${id}:update`, { expectedRevision, body }),
      id,
      expectedRevision,
      input,
      new Date(),
    );
  }

  publishMatch(context: MatchCommandContext, matchId: string, expectedRevision: number, body: unknown) {
    const id = canonicalUuid(matchId);
    if (!id || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "공개 요청 구조가 올바르지 않습니다.");
    }
    return this.repository.publishMatch(
      this.envelope(context, `admin:matches:${id}:publish`, { expectedRevision, body }),
      id,
      expectedRevision,
      new Date(),
    );
  }

  voidMatch(context: MatchCommandContext, matchId: string, expectedRevision: number, body: unknown) {
    const id = canonicalUuid(matchId);
    if (!id || !isRecord(body) || !hasExactKeys(body, ["reason"])) {
      throw new MatchServiceError("INVALID_INPUT", "무효화 요청 구조가 올바르지 않습니다.");
    }
    const reason = parseReason(body.reason);
    if (!reason) throw new MatchServiceError("INVALID_INPUT", "무효화 사유를 확인해 주세요.");
    return this.repository.voidMatch(
      this.envelope(context, `admin:matches:${id}:void`, { expectedRevision, body }),
      id,
      expectedRevision,
      reason,
      new Date(),
    );
  }

  restoreMatch(context: MatchCommandContext, matchId: string, expectedRevision: number, body: unknown) {
    const id = canonicalUuid(matchId);
    if (!id || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "복구 요청 구조가 올바르지 않습니다.");
    }
    return this.repository.restoreMatch(
      this.envelope(context, `admin:matches:${id}:restore`, { expectedRevision, body }),
      id,
      expectedRevision,
      new Date(),
    );
  }

  createSubmission(context: MatchCommandContext, body: unknown) {
    const input = parseSubmissionCreateInput(body);
    if (!input) throw new MatchServiceError("INVALID_INPUT", "접수 입력 구조가 올바르지 않습니다.");
    const sourceReferenceHash = this.hmac(
      "klol-v2:match:submission-source:web:v1",
      context.actor.userAccountId,
      input.requestId,
    );
    return this.repository.createSubmission(
      this.envelope(context, "me:match-submissions:create", body),
      input,
      sourceReferenceHash,
      new Date(),
    );
  }

  createAdminImport(context: MatchCommandContext, body: unknown) {
    if (context.actor.purpose !== "ADMIN") {
      throw new MatchServiceError("FORBIDDEN", "관리자 세션에서만 직접 가져오기를 만들 수 있습니다.");
    }
    const input = parseAdminMatchImportInput(body);
    if (!input) {
      throw new MatchServiceError("INVALID_INPUT", "관리자 가져오기 기본 정보가 올바르지 않습니다.");
    }
    const sourceReferenceHash = this.hmac(
      "klol-v2:match:submission-source:admin-import:v1",
      context.actor.userAccountId,
      context.idempotencyMaterial,
    );
    return this.repository.createAdminImport(
      this.envelope(context, "admin:matches:import:create", body),
      input,
      sourceReferenceHash,
      new Date(),
    );
  }

  updateSubmission(
    context: MatchCommandContext,
    submissionId: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const input = parseSubmissionUpdateInput(body);
    const id = canonicalUuid(submissionId);
    if (!id || !input) {
      throw new MatchServiceError("INVALID_INPUT", "접수 식별자 또는 입력 구조가 올바르지 않습니다.");
    }
    return this.repository.updateSubmission(
      this.envelope(context, `me:match-submissions:${id}:update`, { expectedRevision, body }),
      id,
      expectedRevision,
      input,
      new Date(),
    );
  }

  cancelSubmission(
    context: MatchCommandContext,
    submissionIdValue: string,
    expectedRevision: number,
    body: unknown,
  ) {
    if (context.actor.purpose !== "ACCOUNT") {
      throw new MatchServiceError("FORBIDDEN", "계정 세션에서만 본인 접수를 취소할 수 있습니다.");
    }
    const submissionId = canonicalUuid(submissionIdValue);
    if (!submissionId || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "접수 취소 요청 구조가 올바르지 않습니다.");
    }
    return this.repository.cancelSubmission(
      this.envelope(
        context,
        `me:match-submissions:${submissionId}:cancel`,
        { expectedRevision, body },
      ),
      submissionId,
      expectedRevision,
      new Date(),
    );
  }

  cancelAdminImport(
    context: MatchCommandContext,
    submissionIdValue: string,
    expectedRevision: number,
    body: unknown,
  ) {
    if (context.actor.purpose !== "ADMIN") {
      throw new MatchServiceError("FORBIDDEN", "관리자 세션에서만 직접 가져오기를 취소할 수 있습니다.");
    }
    const submissionId = canonicalUuid(submissionIdValue);
    if (!submissionId || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "직접 가져오기 취소 요청 구조가 올바르지 않습니다.");
    }
    return this.repository.cancelSubmission(
      this.envelope(
        context,
        `admin:match-imports:${submissionId}:cancel`,
        { expectedRevision, body },
      ),
      submissionId,
      expectedRevision,
      new Date(),
    );
  }

  private normalizedUploadDeclaration(input: SubmissionImageUploadDeclaration) {
    const submissionId = canonicalUuid(input.submissionId);
    const contentType = MATCH_IMAGE_CONTENT_TYPES.find((entry) => entry === input.contentType);
    const originalFileName = safeUploadOriginalName(input.originalFileName);
    if (
      !submissionId ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !Number.isSafeInteger(input.gameNumber) ||
      input.gameNumber < 1 ||
      input.gameNumber > MATCH_IMAGE_MAX_COUNT ||
      !contentType ||
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize < 12 ||
      input.byteSize > MATCH_IMAGE_MAX_BYTES ||
      typeof input.sha256Hex !== "string" ||
      !/^[0-9a-f]{64}$/.test(input.sha256Hex) ||
      ((input.originalFileName ?? null) !== null && originalFileName === null)
    ) {
      throw new MatchServiceError("INVALID_INPUT", "이미지 업로드 선언이 올바르지 않습니다.");
    }
    return {
      submissionId,
      expectedRevision: input.expectedRevision,
      gameNumber: input.gameNumber,
      contentType,
      byteSize: input.byteSize,
      sha256Hex: input.sha256Hex,
      originalFileName,
    } as const;
  }

  private uploadStorageIdentity(
    context: MatchCommandContext,
    declaration: ReturnType<MatchService["normalizedUploadDeclaration"]>,
    keyHash: Uint8Array,
  ) {
    const objectDigest = this.hmac(
      "klol-v2:match:private-storage-key:v1",
      context.actor.userAccountId,
      canonical(declaration),
      keyHash,
    ).toString("hex");
    return {
      storageProvider: this.privateStorage?.storageProvider ?? "UNAVAILABLE",
      storageKey: `match-scoreboards/${declaration.submissionId}/${declaration.gameNumber}/${objectDigest}`,
    } as const;
  }

  private uploadEnvelope(context: MatchCommandContext, declaration: ReturnType<MatchService["normalizedUploadDeclaration"]>) {
    const scope = context.actor.purpose === "ADMIN"
      ? `admin:match-imports:${declaration.submissionId}:images:${declaration.gameNumber}`
      : `me:match-submissions:${declaration.submissionId}:images:${declaration.gameNumber}`;
    const preliminary = this.envelope(context, scope, { declaration });
    const storage = this.uploadStorageIdentity(context, declaration, preliminary.keyHash);
    return this.envelope(
      context,
      scope,
      { declaration, storage },
    );
  }

  async prepareSubmissionImageUpload(
    context: MatchCommandContext,
    input: SubmissionImageUploadDeclaration,
  ): Promise<PrivateImageUploadReservationResult> {
    if (context.actor.purpose !== "ACCOUNT") {
      throw new MatchServiceError("FORBIDDEN", "계정 세션 업로드만 이 경로에서 처리할 수 있습니다.");
    }
    return this.preparePrivateImageUpload(context, input);
  }

  async prepareAdminImportImageUpload(
    context: MatchCommandContext,
    input: SubmissionImageUploadDeclaration,
  ): Promise<PrivateImageUploadReservationResult> {
    if (context.actor.purpose !== "ADMIN") {
      throw new MatchServiceError("FORBIDDEN", "관리자 세션에서만 직접 가져오기 이미지를 처리할 수 있습니다.");
    }
    return this.preparePrivateImageUpload(context, input);
  }

  private async preparePrivateImageUpload(
    context: MatchCommandContext,
    input: SubmissionImageUploadDeclaration,
  ): Promise<PrivateImageUploadReservationResult> {
    const declaration = this.normalizedUploadDeclaration(input);
    if (
      !(context.rateLimitMaterial instanceof Uint8Array) ||
      context.rateLimitMaterial.byteLength < 1 ||
      context.rateLimitMaterial.byteLength > 512
    ) {
      throw new MatchServiceError(
        "RATE_LIMIT_UNAVAILABLE",
        "신뢰할 수 있는 업로드 요청 출처를 확인할 수 없습니다.",
      );
    }
    const envelope = this.uploadEnvelope(context, declaration);
    const storage = this.uploadStorageIdentity(context, declaration, envelope.keyHash);
    const prepared = await this.repository.reservePrivateImageUpload(
      envelope,
      {
        submissionId: declaration.submissionId,
        expectedRevision: declaration.expectedRevision,
        gameNumber: declaration.gameNumber,
        declaredContentType: declaration.contentType,
        declaredByteSize: declaration.byteSize,
        declaredSha256: Buffer.from(declaration.sha256Hex, "hex"),
        storageProvider: storage.storageProvider,
        storageKey: storage.storageKey,
        accountRateLimitKeyHash: this.hmac(
          "klol-v2:match:rate-limit:upload-account:v1",
          context.actor.userAccountId,
        ),
        networkRateLimitKeyHash: this.hmac(
          "klol-v2:match:rate-limit:upload-network:v1",
          context.rateLimitMaterial,
        ),
      },
      new Date(),
    );
    if (prepared.kind === "RESERVED" && !this.privateStorage) {
      await this.repository
        .cancelPrivateImageUpload(envelope, prepared.reservationId, new Date())
        .catch(() => undefined);
      throw new MatchServiceError(
        "PRIVATE_STORAGE_UNAVAILABLE",
        "비공개 이미지 저장소가 준비되지 않았습니다.",
      );
    }
    return prepared;
  }

  async finalizeSubmissionImageUpload(
    context: MatchCommandContext,
    reservationIdValue: string,
    input: SubmissionImageUploadDeclaration,
    bytes: Uint8Array,
  ) {
    if (context.actor.purpose !== "ACCOUNT") {
      throw new MatchServiceError("FORBIDDEN", "계정 세션 업로드만 이 경로에서 처리할 수 있습니다.");
    }
    return this.finalizePrivateImageUpload(context, reservationIdValue, input, bytes, "WEB_USER");
  }

  async finalizeAdminImportImageUpload(
    context: MatchCommandContext,
    reservationIdValue: string,
    input: SubmissionImageUploadDeclaration,
    bytes: Uint8Array,
  ) {
    if (context.actor.purpose !== "ADMIN") {
      throw new MatchServiceError("FORBIDDEN", "관리자 세션에서만 직접 가져오기 이미지를 처리할 수 있습니다.");
    }
    return this.finalizePrivateImageUpload(context, reservationIdValue, input, bytes, "ADMIN");
  }

  private async finalizePrivateImageUpload(
    context: MatchCommandContext,
    reservationIdValue: string,
    input: SubmissionImageUploadDeclaration,
    bytes: Uint8Array,
    ingestSource: "WEB_USER" | "ADMIN",
  ) {
    const declaration = this.normalizedUploadDeclaration(input);
    const reservationId = canonicalUuid(reservationIdValue);
    const envelope = this.uploadEnvelope(context, declaration);
    const storageIdentity = this.uploadStorageIdentity(context, declaration, envelope.keyHash);
    if (!reservationId) {
      throw new MatchServiceError("PRIVATE_STORAGE_UNAVAILABLE", "비공개 이미지 저장소가 준비되지 않았습니다.");
    }
    const cancel = () =>
      this.repository.cancelPrivateImageUpload(envelope, reservationId, new Date()).catch(() => undefined);
    if (
      bytes.byteLength !== declaration.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== declaration.sha256Hex
    ) {
      await cancel();
      throw new MatchServiceError("INVALID_IMAGE", "선언한 이미지 길이 또는 SHA-256과 본문이 다릅니다.");
    }
    let validated: Awaited<ReturnType<typeof validatePrivateScoreboardImage>>;
    try {
      validated = await validatePrivateScoreboardImage({
        bytes,
        declaredContentType: declaration.contentType,
        originalFileName: declaration.originalFileName,
      });
    } catch (error) {
      await cancel();
      throw error;
    }
    if (!this.privateStorage) {
      await cancel();
      throw new MatchServiceError("PRIVATE_STORAGE_UNAVAILABLE", "비공개 이미지 저장소가 준비되지 않았습니다.");
    }
    const cleanupStaged = async (failureCode: string) => {
      await this.repository.requestPrivateImageUploadCleanup(
        envelope,
        reservationId,
        failureCode,
        new Date(),
      );
      try {
        await this.runAdapter(
          "PRIVATE_STORAGE_DELETE_TIMEOUT",
          this.adapterDeadlines.storageDeleteMs,
          (signal) => this.privateStorage!.requestDelete(storageIdentity.storageKey, signal),
        );
      } catch {
        throw new MatchServiceError(
          "PRIVATE_STORAGE_UNAVAILABLE",
          "비공개 이미지 정리 작업을 예약했지만 저장소 삭제를 완료하지 못했습니다.",
        );
      }
      await this.repository.confirmPrivateImageUploadDeleted(
        envelope,
        reservationId,
        new Date(),
      );
    };
    try {
      await this.runAdapter(
        "PRIVATE_STORAGE_STAGE_TIMEOUT",
        this.adapterDeadlines.storageStageMs,
        (signal) => this.privateStorage!.stageAt({
          storageKey: storageIdentity.storageKey,
          bytes: validated.bytes,
          sha256Hex: validated.sha256Hex,
          signal,
        }),
      );
    } catch (error) {
      await this.repository.requestPrivateImageUploadCleanup(
        envelope,
        reservationId,
        error instanceof MatchAdapterDeadlineError
          ? "STAGE_AMBIGUOUS_TIMEOUT"
          : "STAGE_AMBIGUOUS_FAILURE",
        new Date(),
      );
      throw new MatchServiceError("PRIVATE_STORAGE_UNAVAILABLE", "비공개 이미지 저장에 실패했습니다.");
    }
    try {
      await this.repository.markPrivateImageUploadStaged(envelope, reservationId, new Date());
    } catch (error) {
      await cleanupStaged("STAGE_RECORD_FAILED");
      throw error;
    }
    let ocrResult:
      | { status: "SUCCEEDED"; candidate: Record<string, unknown> }
      | { status: "FAILED"; errorCode: string };
    try {
      const candidate = safeOcrCandidate(
        await this.runAdapter(
          "OCR_TIMEOUT",
          this.adapterDeadlines.ocrMs,
          (signal) => this.scoreboardOcr!.inspect({
            bytes: validated.bytes,
            contentType: validated.contentType,
            gameNumber: declaration.gameNumber,
            signal,
          }),
        ),
        declaration.gameNumber,
      );
      ocrResult = candidate
        ? { status: "SUCCEEDED", candidate }
        : { status: "FAILED", errorCode: "OCR_INVALID_OUTPUT" };
    } catch (error) {
      ocrResult = {
        status: "FAILED",
        errorCode: error instanceof MatchAdapterDeadlineError ? "OCR_TIMEOUT" : "OCR_UNAVAILABLE",
      };
    }
    try {
      const result = await this.repository.finalizePrivateImageUpload(
        envelope,
        {
          reservationId,
          submissionId: declaration.submissionId,
          expectedRevision: declaration.expectedRevision,
          gameNumber: declaration.gameNumber,
          storageProvider: storageIdentity.storageProvider,
          storageKey: storageIdentity.storageKey,
          originalFileName: validated.originalFileName,
          contentType: validated.contentType,
          byteSize: validated.byteSize,
          width: validated.width,
          height: validated.height,
          sha256: validated.sha256,
          ingestSource,
          ocrResult,
        },
        new Date(),
      );
      return result;
    } catch (error) {
      await cleanupStaged("FINALIZE_FAILED");
      throw error;
    }
  }

  async cancelSubmissionImageUpload(
    context: MatchCommandContext,
    reservationIdValue: string,
    input: SubmissionImageUploadDeclaration,
  ) {
    const declaration = this.normalizedUploadDeclaration(input);
    const reservationId = canonicalUuid(reservationIdValue);
    if (!reservationId) return;
    await this.repository.cancelPrivateImageUpload(
      this.uploadEnvelope(context, declaration),
      reservationId,
      new Date(),
    );
  }

  /** Convenience adapter for non-streaming callers. HTTP routes use prepare first. */
  async attachSubmissionImage(
    context: MatchCommandContext,
    input: Readonly<{
      submissionId: string;
      expectedRevision: number;
      gameNumber: number;
      bytes: Uint8Array;
      contentType: string | null;
      originalFileName?: string | null;
    }>,
  ) {
    if (!input.contentType) {
      throw new MatchServiceError("INVALID_INPUT", "이미지 Content-Type이 필요합니다.");
    }
    const declaration = {
      submissionId: input.submissionId,
      expectedRevision: input.expectedRevision,
      gameNumber: input.gameNumber,
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
      sha256Hex: createHash("sha256").update(input.bytes).digest("hex"),
      originalFileName: input.originalFileName,
    };
    const prepared = await this.prepareSubmissionImageUpload(context, declaration);
    if (prepared.kind === "REPLAY") return prepared.result;
    return this.finalizeSubmissionImageUpload(
      context,
      prepared.reservationId,
      declaration,
      input.bytes,
    );
  }

  async saveSubmissionReviewDraft(
    context: MatchCommandContext,
    submissionId: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const id = canonicalUuid(submissionId);
    const seasonId = isRecord(body) ? canonicalUuid(body.seasonId) : null;
    if (
      !id ||
      !isRecord(body) ||
      !hasExactKeys(body, ["seasonId", "reviewedResult"]) ||
      !seasonId
    ) {
      throw new MatchServiceError("INVALID_INPUT", "관리자 검토안 구조가 올바르지 않습니다.");
    }
    const submission = await this.repository.getAdminSubmission(id);
    if (!submission) throw new MatchServiceError("NOT_FOUND", "접수를 찾을 수 없습니다.");
    const reviewedResult = parseReviewResultInput(body.reviewedResult, submission.expectedGameCount);
    if (!reviewedResult) throw new MatchServiceError("INVALID_INPUT", "검토 결과 구조가 올바르지 않습니다.");
    return this.repository.saveSubmissionReviewDraft(
      this.envelope(context, `admin:match-submissions:${id}:review-draft`, {
        expectedRevision,
        body,
      }),
      { submissionId: id, expectedRevision, seasonId, reviewedResult },
      new Date(),
    );
  }

  async approveSubmission(
    context: MatchCommandContext,
    submissionId: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const id = canonicalUuid(submissionId);
    if (!id || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "접수 승인 요청 구조가 올바르지 않습니다.");
    }
    const submission = await this.repository.getAdminSubmission(id);
    const games = submission?.reviewedResult
      ? parseReviewedGames(submission.reviewedResult, submission.expectedGameCount)
      : null;
    if (!submission || !games) {
      throw new MatchServiceError("INVALID_TRANSITION", "승인할 관리자 검토 결과가 없습니다.");
    }
    return this.repository.approveSubmission(
      this.envelope(context, `admin:match-submissions:${id}:approve`, { expectedRevision, body }),
      id,
      expectedRevision,
      games,
      new Date(),
    );
  }

  rejectSubmission(
    context: MatchCommandContext,
    submissionId: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const id = canonicalUuid(submissionId);
    if (!id || !isRecord(body) || !hasExactKeys(body, ["publicReason"])) {
      throw new MatchServiceError("INVALID_INPUT", "접수 거절 요청 구조가 올바르지 않습니다.");
    }
    const reason = parseReason(body.publicReason);
    if (!reason) throw new MatchServiceError("INVALID_INPUT", "사용자에게 표시할 거절 사유가 필요합니다.");
    return this.repository.rejectSubmission(
      this.envelope(context, `admin:match-submissions:${id}:reject`, { expectedRevision, body }),
      id,
      expectedRevision,
      reason,
      new Date(),
    );
  }

  reopenSubmission(
    context: MatchCommandContext,
    submissionId: string,
    expectedRevision: number,
    body: unknown,
  ) {
    const id = canonicalUuid(submissionId);
    if (!id || !exactEmptyObject(body)) {
      throw new MatchServiceError("INVALID_INPUT", "접수 재개 요청 구조가 올바르지 않습니다.");
    }
    return this.repository.reopenSubmission(
      this.envelope(context, `admin:match-submissions:${id}:reopen`, { expectedRevision, body }),
      id,
      expectedRevision,
      new Date(),
    );
  }
}
