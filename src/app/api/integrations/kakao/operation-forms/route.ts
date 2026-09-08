import { randomUUID } from "node:crypto";

import { isOperationFormType, OperationFormError } from "@/modules/recruiting/operation-forms/domain";
import {
  operationFormErrorResponse,
  operationFormMutationResponse,
  operationFormUnavailableResponse,
  operationFormWebhookForbiddenResponse,
} from "@/modules/recruiting/operation-forms/http";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import {
  MAXIMUM_KAKAO_BODY_BYTES,
  recordKakaoWebhookRejection,
  verifyKakaoHttpRequest,
} from "@/modules/recruiting/infrastructure/kakao-http-request";
import {
  problemForIdempotencyKeyError, problemForJsonBodyError, problemResponse,
  readIdempotencyKey, readJsonBody, readValidatedTraceId,
} from "@/platform/http";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function exactEnvelope(value: unknown): value is { formType: string; payload: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "formType,payload" &&
    typeof (value as { formType?: unknown }).formType === "string";
}

export async function POST(request: Request) {
  const traceId = readValidatedTraceId(request.headers);
  const verification = await verifyKakaoHttpRequest(request, new Date(), MAXIMUM_KAKAO_BODY_BYTES);
  if (!verification.ok) {
    recordKakaoWebhookRejection(verification.code, { route: new URL(request.url).pathname, traceId });
    return operationFormWebhookForbiddenResponse(traceId);
  }
  const { rawBody, intent } = verification.value;
  if (!await isRuntimeKakaoFeatureEnabled("recruitingEnabled")) return operationFormUnavailableResponse(traceId);
  const parsedJson = await readJsonBody(new Request(request.url, {
    method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: rawBody,
  }), { maximumBytes: MAXIMUM_KAKAO_BODY_BYTES });
  if (!parsedJson.ok) return problemResponse(problemForJsonBodyError(parsedJson.error), { traceId });
  if (!exactEnvelope(parsedJson.value) || !isOperationFormType(parsedJson.value.formType)) {
    return operationFormErrorResponse(new OperationFormError("INVALID_FORM_PAYLOAD"), traceId);
  }
  const idempotency = readIdempotencyKey(request.headers);
  if (!idempotency.ok) return problemResponse(problemForIdempotencyKeyError(idempotency.error), { traceId });
  const service = getRuntimeOperationForms(); if (!service) return operationFormUnavailableResponse(traceId);
  try {
    return operationFormMutationResponse(await service.submit({
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao", intent,
      requestId: randomUUID(), idempotency: { requestKey: idempotency.key.normalized, bodyDigestHex: intent.bodyDigestHex },
      formType: parsedJson.value.formType, payload: parsedJson.value.payload,
    }), traceId);
  } catch (error) { return operationFormErrorResponse(error, traceId); }
}
