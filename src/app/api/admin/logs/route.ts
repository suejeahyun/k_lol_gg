import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { operationsErrorResponse, operationsUnavailableResponse, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";
import { noStoreJsonResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireOperationsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers);
  const query = new URL(request.url).searchParams;
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 25);
  const action = query.get("action")?.trim() || undefined;
  if (![...query.keys()].every((key) => ["page", "pageSize", "action"].includes(key)) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (action && !/^[A-Z0-9_]{1,96}$/u.test(action))) return operationsErrorResponse(new Error("INVALID_QUERY"), traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(traceId);
  try { return noStoreJsonResponse({ ...(await repository.listAuditLogs({ page, pageSize, action })), page, pageSize }, { traceId }); }
  catch (error) { return operationsErrorResponse(error, traceId); }
}
