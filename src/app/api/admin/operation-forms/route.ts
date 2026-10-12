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
  if ([...search.keys()].some((key) => !["type", "status", "page"].includes(key)) || ["type", "status", "page"].some((key) => search.getAll(key).length > 1)) {
    return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), traceId);
  }
  const rawType = search.get("type") || undefined; const rawStatus = search.get("status") || undefined;
  const rawPage = search.get("page") ?? "1";
  const page = Number(rawPage);
  if (!/^[1-9]\d*$/u.test(rawPage) || !Number.isSafeInteger(page)) return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), traceId);
  if ((rawType && !isOperationFormType(rawType)) || (rawStatus && !isOperationFormStatus(rawStatus))) return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), traceId);
  const formType = rawType && isOperationFormType(rawType) ? rawType : undefined;
  const status = rawStatus && isOperationFormStatus(rawStatus) ? rawStatus : undefined;
  const service = getRuntimeOperationForms(); if (!service) return operationFormUnavailableResponse(traceId);
  try { return operationFormReadResponse(await service.list({ formType, status, page }), traceId); }
  catch (error) { return operationFormErrorResponse(error, traceId); }
}
