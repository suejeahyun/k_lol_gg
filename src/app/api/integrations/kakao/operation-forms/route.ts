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
  kakaoWebhookSecrets,
  MAXIMUM_KAKAO_BODY_BYTES,
  readBoundedKakaoRawBody,
  splitKakaoIdentifiers,
} from "@/modules/recruiting/infrastructure/kakao-http-request";
import { verifyKakaoWebhook } from "@/modules/recruiting/infrastructure/kakao-signature";
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
  if (new URL(request.url).searchParams.size) return operationFormWebhookForbiddenResponse(traceId);
  const timestampText = request.headers.get("x-klol-timestamp");
  const timestampSeconds = timestampText && /^(?:0|[1-9][0-9]{0,12})$/u.test(timestampText) ? Number(timestampText) : -1;
  const selfHeader = request.headers.get("x-klol-bot-self");
  const secrets = kakaoWebhookSecrets(); const rawBody = await readBoundedKakaoRawBody(request);
  if (!secrets || !rawBody || (selfHeader !== "0" && selfHeader !== "1")) return operationFormWebhookForbiddenResponse(traceId);
  const verification = verifyKakaoWebhook({
    request: {
      timestampSeconds, nonce: request.headers.get("x-klol-nonce") ?? "",
      roomId: request.headers.get("x-klol-room") ?? "", senderId: request.headers.get("x-klol-sender") ?? "",
      botSelf: selfHeader === "1", signature: request.headers.get("x-klol-signature") ?? "", rawBody,
    },
    now: new Date(), secrets,
    allowedRoomIds: splitKakaoIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_ROOMS),
    allowedSenderIds: splitKakaoIdentifiers(process.env.KAKAO_WEBHOOK_ALLOWED_SENDERS),
    botSenderId: process.env.KAKAO_WEBHOOK_BOT_SENDER_ID ?? "", nonceAlreadyUsed: false,
  });
  if (!verification.ok) return operationFormWebhookForbiddenResponse(traceId);
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
      actorPrincipalId: process.env.KAKAO_WEBHOOK_PRINCIPAL_ID ?? "bot:kakao", intent: verification.intent,
      requestId: randomUUID(), idempotency: { requestKey: idempotency.key.normalized, bodyDigestHex: verification.intent.bodyDigestHex },
      formType: parsedJson.value.formType, payload: parsedJson.value.payload,
    }), traceId);
  } catch (error) { return operationFormErrorResponse(error, traceId); }
}
