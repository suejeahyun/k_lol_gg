import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { parseSiteSettingsPatch } from "@/modules/operations/infrastructure/operations-input";
import {
  operationsActor, operationsErrorResponse, operationsMutationResponse, operationsUnavailableResponse,
  prepareOperationsMutation, requireOperationsApiSession,
} from "@/modules/operations/infrastructure/operations-http";
import { formatRevisionEtag, noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

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
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(prepared.traceId);
  try {
    return operationsMutationResponse(await repository.updateSettings({ actor: operationsActor(authorization.session), metadata: prepared.metadata, patch }), prepared.traceId);
  } catch (error) { return operationsErrorResponse(error, prepared.traceId); }
}
