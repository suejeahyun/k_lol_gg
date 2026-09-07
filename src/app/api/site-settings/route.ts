import { toPublicSiteSettingsDto } from "@/modules/operations/domain/site-settings";
import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { operationsErrorResponse, operationsUnavailableResponse } from "@/modules/operations/infrastructure/operations-http";
import { formatRevisionEtag, noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return operationsErrorResponse(new Error("INVALID_QUERY"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try {
    const settings = await repository.getSiteSettings();
    return noStoreJsonResponse({ settings: toPublicSiteSettingsDto(settings) }, { traceId, headers: { ETag: formatRevisionEtag(settings.revision) } });
  } catch (error) {
    return operationsErrorResponse(error, traceId);
  }
}
