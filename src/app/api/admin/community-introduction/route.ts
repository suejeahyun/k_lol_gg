import { SERVICE_BRAND } from "@/lib/service-brand";
import { validateCommunityIntroduction } from "@/modules/operations/domain/community-introduction";
import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import {
  operationsActor, operationsErrorResponse, operationsMutationResponse, operationsUnavailableResponse,
  prepareOperationsMutation, requireOperationsApiSession,
} from "@/modules/operations/infrastructure/operations-http";
import { definePublicProblem, formatRevisionEtag, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

function unavailableOnHub() {
  return problemResponse(definePublicProblem({ code: "NOT_FOUND", status: 404, title: "소개를 찾을 수 없습니다.", detail: "각 커뮤니티 사이트의 관리자 화면에서 소개를 관리해 주세요." }));
}

export async function GET(request: Request) {
  if (SERVICE_BRAND.id === "hub") return unavailableOnHub();
  const authorization = await requireOperationsApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return operationsErrorResponse(new Error("INVALID_QUERY"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    const introduction = await repository.getCommunityIntroduction();
    return noStoreJsonResponse({ introduction }, { traceId, headers: { ETag: formatRevisionEtag(introduction.revision) } });
  } catch (error) { return operationsErrorResponse(error, traceId); }
}

export async function PUT(request: Request) {
  if (SERVICE_BRAND.id === "hub") return unavailableOnHub();
  const authorization = await requireOperationsApiSession("ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareOperationsMutation(request, 32 * 1_024);
  if (!prepared.ok) return prepared.response;
  try {
    const profile = validateCommunityIntroduction(prepared.body);
    const repository = getRuntimeOperationsRepository();
    if (!repository) return operationsUnavailableResponse(prepared.traceId);
    return operationsMutationResponse(await repository.updateCommunityIntroduction({ actor: operationsActor(authorization.session), metadata: prepared.metadata, profile }), prepared.traceId);
  } catch (error) { return operationsErrorResponse(error, prepared.traceId); }
}
