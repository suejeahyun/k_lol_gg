import { getRuntimeOperationsRepository } from "@/modules/operations/infrastructure/runtime-operations";
import { parseAiRequestBody } from "@/modules/operations/infrastructure/operations-input";
import { operationsActor, operationsErrorResponse, operationsMutationResponse, operationsUnavailableResponse, prepareOperationsMutation, requireOperationsApiSession } from "@/modules/operations/infrastructure/operations-http";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const authorization = await requireOperationsApiSession("USER");
  if (!authorization.ok) return authorization.response;
  const prepared = await prepareOperationsMutation(request, 8 * 1_024);
  if (!prepared.ok) return prepared.response;
  const body = parseAiRequestBody(prepared.body);
  if (!body) return operationsErrorResponse(new Error("INVALID_AI_PROMPT"), prepared.traceId);
  const repository = getRuntimeOperationsRepository();
  if (!repository) return operationsUnavailableResponse(prepared.traceId);
  try { return operationsMutationResponse(await repository.requestAi({ actor: operationsActor(authorization.session), metadata: prepared.metadata, prompt: body.prompt }), prepared.traceId); }
  catch (error) { return operationsErrorResponse(error, prepared.traceId); }
}
