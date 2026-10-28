import { createHash, randomUUID } from "node:crypto";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import {
  definePublicProblem, formatRevisionEtag, noStoreJsonResponse, problemForIdempotencyKeyError,
  problemForIfMatchRevisionError, problemForJsonBodyError, problemResponse, readIdempotencyKey,
  readIfMatchRevision, readJsonBody, readValidatedTraceId,
} from "@/platform/http";
import type { CommunitySiteCommandMetadata, CommunitySiteCommandResult } from "../application/ports";
import { CommunitySiteError, parseCommunitySiteId, parseCreateCommunitySiteCommand, parseOwnerCommunitySiteCommand, parseReviewCommunitySiteCommand } from "../domain/community-site";
import { CommunitySiteConfigurationError } from "../domain/site-configuration";
import { getRuntimeCommunitySitesRepository, isCommunitySiteProvisioningReady, isCommunitySitesEnabled } from "./runtime";

const problems = {
  unauthenticated: definePublicProblem({ code: "UNAUTHENTICATED", status: 401, title: "로그인이 필요합니다.", detail: "다시 로그인한 뒤 요청해 주세요." }),
  forbidden: definePublicProblem({ code: "FORBIDDEN", status: 403, title: "요청 권한이 없습니다.", detail: "계정 상태와 현재 관리자 권한을 확인해 주세요." }),
  origin: definePublicProblem({ code: "ORIGIN_FORBIDDEN", status: 403, title: "허용되지 않은 요청 출처입니다.", detail: "같은 사이트에서 다시 요청해 주세요." }),
  invalid: definePublicProblem({ code: "INVALID_COMMUNITY_SITE_INPUT", status: 400, title: "사이트 설정을 확인해 주세요.", detail: "필수 항목, 주소, 테마와 기능 설정을 확인해 주세요." }),
  missing: definePublicProblem({ code: "COMMUNITY_SITE_NOT_FOUND", status: 404, title: "사이트를 찾을 수 없습니다.", detail: "신청 목록에서 접근할 수 있는 사이트를 선택해 주세요." }),
  stale: definePublicProblem({ code: "PRECONDITION_FAILED", status: 412, title: "사이트 정보가 변경되었습니다.", detail: "최신 정보를 불러온 뒤 다시 요청해 주세요." }),
  idempotency: definePublicProblem({ code: "IDEMPOTENCY_MISMATCH", status: 409, title: "다른 요청에 사용한 멱등성 키입니다.", detail: "새 Idempotency-Key로 요청해 주세요." }),
  conflict: definePublicProblem({ code: "COMMUNITY_SITE_STATE_CONFLICT", status: 409, title: "현재 상태에서는 요청할 수 없습니다.", detail: "심사 또는 개설 상태를 새로 확인해 주세요. 승인만으로 사이트가 운영 중으로 바뀌지는 않습니다." }),
  busy: definePublicProblem({ code: "COMMUNITY_SITE_JOB_IN_PROGRESS", status: 409, title: "게시 작업이 진행 중입니다.", detail: "현재 작업이 끝난 뒤 다시 게시해 주세요." }),
  slug: definePublicProblem({ code: "COMMUNITY_SITE_SLUG_LOCKED", status: 409, title: "운영 중인 사이트의 별칭은 변경할 수 없습니다.", detail: "주소 변경은 별도의 소유권 확인 절차가 필요합니다." }),
  unique: definePublicProblem({ code: "COMMUNITY_SITE_UNIQUE_CONFLICT", status: 409, title: "이미 사용 중인 별칭 또는 주소입니다.", detail: "다른 별칭을 선택하거나 최신 상태를 확인해 주세요." }),
  unavailable: definePublicProblem({ code: "COMMUNITY_SITES_UNAVAILABLE", status: 503, title: "사이트 개설 기능을 사용할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
  notReady: definePublicProblem({ code: "COMMUNITY_SITE_PROVISIONING_NOT_READY", status: 503, title: "자동 개설 설정이 준비되지 않았습니다.", detail: "GG HUB 운영자가 개설 기능, Vercel·Neon 연결과 배포 버전 설정을 완료한 뒤 승인할 수 있습니다." }),
};

export function communitySitesErrorResponse(error: unknown, traceId?: string) {
  if (error instanceof CommunitySiteConfigurationError) return problemResponse(problems.invalid, { traceId });
  if (error instanceof CommunitySiteError) {
    const problem = error.code === "SESSION_STALE" ? problems.unauthenticated
      : error.code === "COMMUNITY_SITE_NOT_FOUND" ? problems.missing
      : error.code === "STALE_COMMUNITY_SITE_REVISION" ? problems.stale
      : error.code === "IDEMPOTENCY_MISMATCH" ? problems.idempotency
      : error.code === "COMMUNITY_SITE_UNIQUE_CONFLICT" ? problems.unique
      : error.code === "COMMUNITY_SITE_STATE_CONFLICT" ? problems.conflict
      : error.code === "COMMUNITY_SITE_JOB_IN_PROGRESS" ? problems.busy
      : error.code === "COMMUNITY_SITE_SLUG_LOCKED" ? problems.slug
      : error.code.startsWith("INVALID_") ? problems.invalid : problems.unavailable;
    return problemResponse(problem, { traceId });
  }
  return problemResponse(problems.unavailable, { traceId });
}
async function prepareMutation(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (!hasSameOrigin(request, process.env.V2_PUBLIC_ORIGIN ?? process.env.PUBLIC_ORIGIN)) return { ok: false as const, response: problemResponse(problems.origin, { traceId }) };
  const body = await readJsonBody(request, { maximumBytes: 64 * 1024 });
  if (!body.ok) return { ok: false as const, response: problemResponse(problemForJsonBodyError(body.error), { traceId }) };
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return { ok: false as const, response: problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId }) };
  const revision = readIfMatchRevision(request.headers);
  if (!revision.ok) return { ok: false as const, response: problemResponse(problemForIfMatchRevisionError(revision.error), { traceId }) };
  return { ok: true as const, body: body.value, metadata: {
    requestId: randomUUID(), requestKey: idempotency.key.normalized, expectedRevision: revision.revision,
    requestHashHex: createHash("sha256").update(JSON.stringify({ path: new URL(request.url).pathname, method: request.method,
      body: body.value, expectedRevision: revision.revision })).digest("hex"),
  } satisfies CommunitySiteCommandMetadata };
}
function mutationResponse(result: CommunitySiteCommandResult, traceId?: string) {
  return noStoreJsonResponse(result.body, { status: result.status, traceId, headers: {
    ETag: formatRevisionEtag(result.revision), ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
  } });
}

export async function handleCommunitySitesRequest(request: Request, scope: "owner" | "admin", id?: string) {
  const traceId = readValidatedTraceId(request.headers);
  if (!isCommunitySitesEnabled()) return problemResponse(problems.unavailable, { traceId });
  const authorization = await authorizeApiRole(scope === "admin" ? "SUPER_ADMIN" : "USER");
  if (!authorization.allowed) return problemResponse(authorization.reason === "UNAUTHENTICATED" ? problems.unauthenticated : problems.forbidden, { traceId });
  if (new URL(request.url).searchParams.size) return problemResponse(problems.invalid, { traceId });
  try {
    if (id !== undefined) parseCommunitySiteId(id);
    const actor = transactionSessionActor(authorization.session);
    if (request.method === "GET" || request.method === "HEAD") {
      const repository = getRuntimeCommunitySitesRepository();
      if (!repository) return problemResponse(problems.unavailable, { traceId });
      if (!id) return noStoreJsonResponse({ sites: await repository.listSites(actor, scope), ...(scope === "admin" ? { provisioningReady: isCommunitySiteProvisioningReady() } : {}) }, { traceId });
      const site = await repository.getSite(actor, id, scope);
      return noStoreJsonResponse({ site, ...(scope === "admin" ? { provisioningReady: isCommunitySiteProvisioningReady() } : {}) }, { traceId, headers: { ETag: formatRevisionEtag(site.revision) } });
    }
    const prepared = await prepareMutation(request);
    if (!prepared.ok) return prepared.response;
    if (request.method === "POST" && scope === "owner" && !id) {
      const command = parseCreateCommunitySiteCommand(prepared.body);
      const repository = getRuntimeCommunitySitesRepository();
      if (!repository) return problemResponse(problems.unavailable, { traceId });
      return mutationResponse(await repository.createSite({ actor, metadata: prepared.metadata, command }), traceId);
    }
    if (request.method === "PATCH" && id) {
      const command = scope === "owner" ? parseOwnerCommunitySiteCommand(prepared.body) : parseReviewCommunitySiteCommand(prepared.body);
      if (scope === "admin" && command.action === "approve" && !isCommunitySiteProvisioningReady()) return problemResponse(problems.notReady, { traceId });
      const repository = getRuntimeCommunitySitesRepository();
      if (!repository) return problemResponse(problems.unavailable, { traceId });
      const result = scope === "owner"
        ? await repository.updateSite({ actor, id, metadata: prepared.metadata, command: parseOwnerCommunitySiteCommand(command) })
        : await repository.reviewSite({ actor, id, metadata: prepared.metadata, command: parseReviewCommunitySiteCommand(command) });
      return mutationResponse(result, traceId);
    }
    return problemResponse(problems.invalid, { traceId });
  } catch (error) { return communitySitesErrorResponse(error, traceId); }
}
