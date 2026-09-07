import { getRuntimeKakaoAdmin } from "@/modules/recruiting/kakao-admin/runtime";
import { KakaoAdminError } from "@/modules/recruiting/kakao-admin/postgres-kakao-admin";
import { parseKakaoOperationSettingsPatch, readKakaoRuntimeConfiguration } from "@/modules/recruiting/kakao-admin/domain";
import { kakaoAdminErrorResponse, kakaoAdminReadResponse } from "@/modules/recruiting/kakao-admin/http";
import { formatRevisionEtag, readValidatedTraceId } from "@/platform/http";
import { operationsActor, operationsMutationResponse, prepareOperationsMutation, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireOperationsApiSession("ADMIN");
  if (!auth.ok) return auth.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return kakaoAdminErrorResponse(new Error("INVALID_QUERY"), traceId);
  const service = getRuntimeKakaoAdmin();
  if (!service) return kakaoAdminErrorResponse(new Error("UNAVAILABLE"), traceId);
  try {
    const settings = await service.getSettings();
    return kakaoAdminReadResponse({ settings, runtime: readKakaoRuntimeConfiguration() }, traceId, { ETag: formatRevisionEtag(settings.revision) });
  } catch (error) { return kakaoAdminErrorResponse(error, traceId); }
}

export async function POST(request: Request) {
  const auth = await requireOperationsApiSession("SUPER_ADMIN");
  if (!auth.ok) return auth.response;
  const prepared = await prepareOperationsMutation(request, 8 * 1024);
  if (!prepared.ok) return prepared.response;
  const patch = parseKakaoOperationSettingsPatch(prepared.body);
  if (!patch) return kakaoAdminErrorResponse(new KakaoAdminError("INVALID_INPUT"), prepared.traceId);
  const service = getRuntimeKakaoAdmin();
  if (!service) return kakaoAdminErrorResponse(new Error("UNAVAILABLE"), prepared.traceId);
  try { return operationsMutationResponse(await service.updateSettings({ actor: operationsActor(auth.session), metadata: prepared.metadata, patch }), prepared.traceId); }
  catch (error) { return kakaoAdminErrorResponse(error, prepared.traceId); }
}
