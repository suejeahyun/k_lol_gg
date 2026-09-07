import { createHash, randomUUID } from "node:crypto";

import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import {
  definePublicProblem,
  formatRevisionEtag,
  idempotencyHashMaterial,
  noStoreJsonResponse,
  problemForIdempotencyKeyError,
  problemForIfMatchRevisionError,
  problemForJsonBodyError,
  problemResponse,
  readIdempotencyKey,
  readIfMatchRevision,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

import { ChampionApplicationError } from "../application/command-handler";
import { championCommandRequestHash, type ChampionCommand } from "../application/commands";

const problems = Object.freeze({
  alreadyExists: definePublicProblem({ code: "ALREADY_EXISTS", status: 409, title: "이미 등록된 챔피언입니다.", detail: "고정 키를 확인해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "관리자 권한과 2단계 인증을 확인해 주세요." }),
  idempotencyMismatch: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "멱등성 키가 이미 사용되었습니다.", detail: "새 요청 키로 다시 시도해 주세요." }),
  invalidInput: definePublicProblem({ code: "INVALID_INPUT", status: 400, title: "챔피언 입력이 올바르지 않습니다.", detail: "고정 키, 표시 이름과 상태를 확인해 주세요." }),
  notFound: definePublicProblem({ code: "NOT_FOUND", status: 404, title: "챔피언을 찾을 수 없습니다.", detail: "주소를 확인해 주세요." }),
  originForbidden: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  preconditionFailed: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "다른 변경이 먼저 반영되었습니다.", detail: "최신 챔피언 정보를 다시 불러와 주세요." }),
  unavailable: definePublicProblem({ code: "CHAMPION_SERVICE_UNAVAILABLE", status: 503, title: "챔피언 관리 기능을 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).sort().join("\0") === [...keys].sort().join("\0"));
}

export type PreparedChampionMutation = Readonly<{
  command: ChampionCommand;
  traceId: string | undefined;
}>;

export async function prepareChampionMutation(
  request: Request,
  session: AuthSession,
  input: Readonly<{ type: ChampionCommand["type"]; championKey?: string }>,
): Promise<Readonly<{ ok: true; value: PreparedChampionMutation }> | Readonly<{ ok: false; response: Response }>> {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size) return { ok: false, response: problemResponse(problems.invalidInput, { traceId }) };
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) {
    return { ok: false, response: problemResponse(problems.originForbidden, { traceId }) };
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };

  let championKey = input.championKey ?? "";
  let payload: ChampionCommand["payload"];
  if (input.type === "DEACTIVATE_CHAMPION") {
    if (request.headers.get("content-length") && request.headers.get("content-length") !== "0") {
      return { ok: false, response: problemResponse(problems.invalidInput, { traceId }) };
    }
    payload = {};
  } else {
    const body = await readJsonBody(request, { maximumBytes: 8 * 1024 });
    if (!body.ok) return { ok: false, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
    if (input.type === "CREATE_CHAMPION") {
      if (!exactObject(body.value, ["key", "displayName"]) || typeof body.value.key !== "string" || typeof body.value.displayName !== "string") {
        return { ok: false, response: problemResponse(problems.invalidInput, { traceId }) };
      }
      championKey = body.value.key;
      payload = { displayName: body.value.displayName };
    } else {
      if (!exactObject(body.value, ["displayName", "status"]) || typeof body.value.displayName !== "string" || (body.value.status !== "ACTIVE" && body.value.status !== "INACTIVE")) {
        return { ok: false, response: problemResponse(problems.invalidInput, { traceId }) };
      }
      payload = { displayName: body.value.displayName, status: body.value.status };
    }
  }
  const scope = {
    CREATE_CHAMPION: "admin:champions:create",
    UPDATE_CHAMPION: "admin:champions:update",
    DEACTIVATE_CHAMPION: "admin:champions:deactivate",
  }[input.type];
  const material = idempotencyHashMaterial(idempotency.key, scope);
  const keyHash = createHash("sha256").update(material).digest();
  const bodyDigestHex = createHash("sha256").update(JSON.stringify({ championKey, payload })).digest("hex");
  const base = {
    type: input.type,
    championKey,
    metadata: {
      actorSession: transactionSessionActor(session),
      requestId: randomUUID(),
      expectedRevision: revision.revision,
      issuedAt: new Date().toISOString(),
      authorizationIntent: { kind: "ADMIN_TOTP" as const, sessionId: session.sessionId, minimumRole: "ADMIN" as const, requireTotp: true as const, transactionRecheck: true as const },
      idempotency: { scope, keyHash, requestHash: new Uint8Array(32), bodyDigestHex },
    },
    payload,
  } as ChampionCommand;
  const command = { ...base, metadata: { ...base.metadata, idempotency: { ...base.metadata.idempotency, requestHash: championCommandRequestHash(base) } } } as ChampionCommand;
  return { ok: true, value: { command, traceId } };
}

export function championMutationResponse(result: Awaited<ReturnType<import("../application/command-handler").ChampionCommandHandler["handle"]>>, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.status, traceId, headers: { ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}) } });
}

export function championMutationError(error: unknown, traceId?: string) {
  if (error instanceof ChampionApplicationError) {
    const problem = {
      ALREADY_EXISTS: problems.alreadyExists,
      FORBIDDEN: problems.forbidden,
      IDEMPOTENCY_MISMATCH: problems.idempotencyMismatch,
      INVALID_INPUT: problems.invalidInput,
      NOT_FOUND: problems.notFound,
      PRECONDITION_FAILED: problems.preconditionFailed,
    }[error.code];
    return problemResponse(problem, { traceId });
  }
  if (error instanceof Error && error.message.startsWith("INVALID_CHAMPION")) return problemResponse(problems.invalidInput, { traceId });
  return problemResponse(problems.unavailable, { traceId });
}

export function championUnavailable(traceId?: string) { return problemResponse(problems.unavailable, { traceId }); }
