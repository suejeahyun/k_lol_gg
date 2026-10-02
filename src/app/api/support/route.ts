import { createHmac, randomUUID } from "node:crypto";
import { guardAccountMutationOrigin } from "@/modules/accounts/infrastructure/account-http";
import { guardAccountOperationAttempt } from "@/modules/auth/infrastructure/login-security-guard";
import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { getRuntimeOperationForms } from "@/modules/recruiting/operation-forms/runtime";
import { OperationFormError } from "@/modules/recruiting/operation-forms/domain";
import { OperationFormApplicationError } from "@/modules/recruiting/operation-forms/postgres-operation-forms";
import { parseSiteSupportInput } from "@/modules/recruiting/operation-forms/site-support";
import { noStoreJsonResponse, readIdempotencyKey, readJsonBody } from "@/platform/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originFailure = guardAccountMutationOrigin(request);
  if (originFailure) return originFailure;
  if (new URL(request.url).search) return noStoreJsonResponse({ detail: "문의 주소를 확인해 주세요." }, { status: 400 });
  const key = readIdempotencyKey(request.headers);
  if (!key.ok) return noStoreJsonResponse({ detail: "요청 식별자가 없습니다. 화면을 새로고침해 주세요." }, { status: 400 });
  const raw = await readJsonBody(request, { maximumBytes: 20 * 1024 });
  if (!raw.ok) return noStoreJsonResponse({ detail: "문의 내용을 확인해 주세요." }, { status: raw.error === "BODY_TOO_LARGE" ? 413 : raw.error === "UNSUPPORTED_MEDIA_TYPE" ? 415 : 400 });
  try {
    const payload = parseSiteSupportInput(raw.value);
    const context = resolveRuntimeAuthContext();
    const service = getRuntimeOperationForms();
    if (!service || context?.mode !== "database") return noStoreJsonResponse({ detail: "문의 접수를 일시적으로 사용할 수 없어요. 작성한 내용을 보관하고 잠시 후 다시 시도해 주세요." }, { status: 503 });
    const limit = await guardAccountOperationAttempt(request, "support", payload.applicantNickname);
    if (!limit.available) return noStoreJsonResponse({ detail: "문의 접수를 잠시 후 다시 시도해 주세요." }, { status: 503 });
    if (!limit.allowed) return noStoreJsonResponse({ detail: "문의가 너무 자주 접수되었습니다. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const digest = createHmac("sha256", context.rateLimitPepper).update("klol:site-support:v1\0").update(JSON.stringify(payload)).digest("hex");
    const result = await service.submitSupport({ payload, requestId: randomUUID(), idempotency: { requestKey: key.key.normalized, bodyDigestHex: digest } });
    return noStoreJsonResponse(result.body, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} });
  } catch (error) {
    if (error instanceof OperationFormError) return noStoreJsonResponse({ detail: "닉네임, 답변 받을 연락 방법, 문의 종류와 내용을 입력하고 개인정보 수집·이용에 동의해 주세요." }, { status: 400 });
    if (error instanceof OperationFormApplicationError && error.code === "IDEMPOTENCY_MISMATCH") return noStoreJsonResponse({ detail: "문의 내용이 변경되었습니다. 새 문의로 다시 접수해 주세요." }, { status: 409 });
    return noStoreJsonResponse({ detail: "접수 결과를 확인하지 못했어요. 내용을 유지한 채 다시 보내면 중복 접수를 방지합니다." }, { status: 503 });
  }
}
