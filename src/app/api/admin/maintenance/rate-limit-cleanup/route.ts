import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { parseCleanupBody } from "@/modules/operations/infrastructure/operations-input";
import { operationsActor, operationsErrorResponse, operationsMutationResponse, operationsUnavailableResponse, prepareOperationsMutation, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const authorization = await requireOperationsApiSession("SUPER_ADMIN");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareOperationsMutation(request);
  if (!prepared.ok) return prepared.response;
  const body = parseCleanupBody(prepared.body);
  if (!body) return operationsErrorResponse(new Error("INVALID_RETENTION_DAYS"), prepared.traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(prepared.traceId);
  try { return operationsMutationResponse(await repository.runAdminCleanup({ actor: operationsActor(authorization.session), metadata: prepared.metadata, kind: "rate-limits", retentionDays: body.retentionDays }), prepared.traceId); }
  catch (error) { return operationsErrorResponse(error, prepared.traceId); }
}
