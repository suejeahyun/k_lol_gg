import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { operationsErrorResponse, operationsUnavailableResponse, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const authorization = await requireOperationsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  if (new URL(request.url).searchParams.size > 0) return operationsErrorResponse(new Error("INVALID_QUERY"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try { return noStoreJsonResponse({ stats: await repository.getAuditStats() }, { traceId }); }
  catch (error) { return operationsErrorResponse(error, traceId); }
}
