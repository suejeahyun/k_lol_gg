import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { parseSiteSettingsPatch } from "@/modules/operations/infrastructure/operations-input";
import {
  operationsActor, operationsErrorResponse, operationsMutationResponse, operationsUnavailableResponse,
  prepareOperationsMutation, requireOperationsApiSession,
} from "@/modules/operations/infrastructure/operations-http";
import { definePublicProblem, formatRevisionEtag, noStoreJsonResponse, problemResponse, readValidatedTraceId } from "@/platform/http";
import { SERVICE_BRAND } from "@/lib/service-brand";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireOperationsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return operationsErrorResponse(new Error("INVALID_QUERY"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    const settings = await repository.getSiteSettings();
    return noStoreJsonResponse({ settings }, { traceId, headers: { ETag: formatRevisionEtag(settings.revision) } });
  } catch (error) { return operationsErrorResponse(error, traceId); }
}

export async function PUT(request: Request) {
  const authorization = await requireOperationsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareOperationsMutation(request);
  if (!prepared.ok) return prepared.response;
  const patch = parseSiteSettingsPatch(prepared.body);
  if (!patch) return operationsErrorResponse(new Error("INVALID_INPUT"), prepared.traceId);
  if (SERVICE_BRAND.id === "community" && Object.keys(patch).some((key) => !["supportUrl", "internalMaintenanceNote"].includes(key))) {
    return problemResponse(definePublicProblem({ code: "COMMUNITY_SETTINGS_MANAGED_BY_HUB", status: 409,
      title: "이 설정은 GG HUB에서 관리합니다.", detail: "커뮤니티 이름·소개·기능은 GG HUB의 내 사이트에서 변경하고 게시해 주세요. 이 API에서는 지원 URL과 비공개 운영 메모만 저장할 수 있습니다." }), { traceId: prepared.traceId });
  }
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(prepared.traceId);
  try {
    return operationsMutationResponse(await repository.updateSettings({ actor: operationsActor(authorization.session), metadata: prepared.metadata, patch }), prepared.traceId);
  } catch (error) { return operationsErrorResponse(error, prepared.traceId); }
}
