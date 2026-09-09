import { randomUUID } from "node:crypto";

import { KakaoAssistantError, parseManagedOperationFormBody } from "@/modules/recruiting/kakao-assistant/domain";
import { kakaoAssistantErrorResponse, prepareKakaoSignedJson } from "@/modules/recruiting/kakao-assistant/http";
import { isOperationFormType, OperationFormError } from "@/modules/recruiting/operation-forms/domain";
import {
  operationFormErrorResponse,
  operationFormMutationResponse,
  operationFormUnavailableResponse,
} from "@/modules/recruiting/operation-forms/http";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import { isRuntimeKakaoFeatureEnabled } from "@/modules/recruiting/kakao-admin/runtime";
import { MAXIMUM_KAKAO_BODY_BYTES, TRUSTED_KAKAO_SENDER_COMMAND } from "@/modules/recruiting/infrastructure/kakao-http-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const prepared = await prepareKakaoSignedJson(request, MAXIMUM_KAKAO_BODY_BYTES, TRUSTED_KAKAO_SENDER_COMMAND);
  if (!prepared.ok) return prepared.response;
  try {
    const routed = parseManagedOperationFormBody(prepared.body);
    if (!await isRuntimeKakaoFeatureEnabled("recruitingEnabled")) return operationFormUnavailableResponse(prepared.traceId);
    if (!isOperationFormType(routed.formType)) {
      return operationFormErrorResponse(new OperationFormError("INVALID_FORM_TYPE"), prepared.traceId);
    }
    const service = getRuntimeOperationForms();
    if (!service) return operationFormUnavailableResponse(prepared.traceId);
    return operationFormMutationResponse(await service.submit({
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao",
      intent: prepared.intent,
      requestId: randomUUID(),
      idempotency: { requestKey: prepared.requestKey, bodyDigestHex: prepared.intent.bodyDigestHex },
      formType: routed.formType,
      payload: routed.payload,
    }), prepared.traceId);
  } catch (error) {
    if (error instanceof KakaoAssistantError) return kakaoAssistantErrorResponse(error, prepared.traceId);
    return operationFormErrorResponse(error, prepared.traceId);
  }
}
