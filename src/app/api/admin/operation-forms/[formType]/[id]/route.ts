import { randomUUID } from "node:crypto";

import { isOperationFormType, OperationFormError } from "@/modules/recruiting/operation-forms/domain";
import {
  operationFormErrorResponse, operationFormMutationResponse, operationFormReadResponse,
  operationFormUnavailableResponse, prepareOperationFormMutation, requireOperationFormAdmin,
} from "@/modules/recruiting/operation-forms/http";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import { OperationFormApplicationError } from "@/modules/recruiting/operation-forms/postgres-operation-forms";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }

async function routeIdentity(context: { params: Promise<{ formType: string; id: string }> }) {
  const { formType, id } = await context.params;
  return isOperationFormType(formType) && uuid.test(id) ? { formType, id } : null;
}

export async function GET(request: Request, context: { params: Promise<{ formType: string; id: string }> }) {
  const authorization = await requireOperationFormAdmin(); if (!authorization.ok) return authorization.response;
  const traceId = readValidatedTraceId(request.headers); const identity = await routeIdentity(context);
  if (!identity || new URL(request.url).searchParams.size) return operationFormErrorResponse(new OperationFormApplicationError("NOT_FOUND"), traceId);
  const service = getRuntimeOperationForms(); if (!service) return operationFormUnavailableResponse(traceId);
  try {
    const form = await service.get(identity.formType, identity.id);
    return form ? operationFormReadResponse({ form }, traceId) : operationFormErrorResponse(new OperationFormApplicationError("NOT_FOUND"), traceId);
  } catch (error) { return operationFormErrorResponse(error, traceId); }
}

export async function PATCH(request: Request, context: { params: Promise<{ formType: string; id: string }> }) {
  const authorization = await requireOperationFormAdmin(); if (!authorization.ok) return authorization.response;
  const prepared = await prepareOperationFormMutation(request); if (!prepared.ok) return prepared.response;
  const identity = await routeIdentity(context);
  if (!identity || !isRecord(prepared.body)) return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), prepared.traceId);
  const keys = Object.keys(prepared.body); if (!keys.length || keys.some((key) => key !== "status" && key !== "adminNote")) return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), prepared.traceId);
  const service = getRuntimeOperationForms(); if (!service) return operationFormUnavailableResponse(prepared.traceId);
  try { return operationFormMutationResponse(await service.review({
    session: authorization.session, requestId: randomUUID(), idempotency: prepared.idempotency,
    formType: identity.formType, id: identity.id, expectedRevision: prepared.expectedRevision,
    ...(Object.hasOwn(prepared.body, "status") ? { status: prepared.body.status } : {}),
    ...(Object.hasOwn(prepared.body, "adminNote") ? { adminNote: prepared.body.adminNote } : {}),
  }), prepared.traceId); } catch (error) { return operationFormErrorResponse(error, prepared.traceId); }
}

export async function DELETE(request: Request, context: { params: Promise<{ formType: string; id: string }> }) {
  const authorization = await requireOperationFormAdmin(); if (!authorization.ok) return authorization.response;
  const prepared = await prepareOperationFormMutation(request); if (!prepared.ok) return prepared.response;
  const identity = await routeIdentity(context);
  if (!identity || !isRecord(prepared.body) || Object.keys(prepared.body).length !== 1 || !Object.hasOwn(prepared.body, "reason")) {
    return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), prepared.traceId);
  }
  const service = getRuntimeOperationForms(); if (!service) return operationFormUnavailableResponse(prepared.traceId);
  try { return operationFormMutationResponse(await service.softDelete({
    session: authorization.session, requestId: randomUUID(), idempotency: prepared.idempotency,
    formType: identity.formType, id: identity.id, expectedRevision: prepared.expectedRevision, reason: prepared.body.reason,
  }), prepared.traceId); } catch (error) { return operationFormErrorResponse(error, prepared.traceId); }
}
