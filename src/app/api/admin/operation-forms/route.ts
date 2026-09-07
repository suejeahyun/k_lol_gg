import { isOperationFormStatus, isOperationFormType, OperationFormError } from "@/modules/recruiting/operation-forms/domain";
import {
  operationFormErrorResponse, operationFormReadResponse, operationFormUnavailableResponse, requireOperationFormAdmin,
} from "@/modules/recruiting/operation-forms/http";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorization = await requireOperationFormAdmin(); if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers); const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => key !== "type" && key !== "status") || search.getAll("type").length > 1 || search.getAll("status").length > 1) {
    return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), traceId);
  }
  const rawType = search.get("type") || undefined; const rawStatus = search.get("status") || undefined;
  if ((rawType && !isOperationFormType(rawType)) || (rawStatus && !isOperationFormStatus(rawStatus))) return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), traceId);
  const formType = rawType && isOperationFormType(rawType) ? rawType : undefined;
  const status = rawStatus && isOperationFormStatus(rawStatus) ? rawStatus : undefined;
  const service = getRuntimeOperationForms(); if (!service) return operationFormUnavailableResponse(traceId);
  try { return operationFormReadResponse(await service.list({ formType, status }), traceId); }
  catch (error) { return operationFormErrorResponse(error, traceId); }
}
