import { SERVICE_BRAND } from "@/lib/service-brand";
import { parseCommunitySsoRequest, SSO_TOKEN_PATTERN } from "@/modules/auth/domain/community-sso";
import { communitySsoRepository, hubSsoOrigin } from "@/modules/auth/infrastructure/runtime-community-sso";
import { guardAccountOperationAttempt } from "@/modules/auth/infrastructure/login-security-guard";
import { noStoreJsonResponse, readJsonBody } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (SERVICE_BRAND.id !== "hub") return new Response(null, { status: 404 });
  const denied = () => noStoreJsonResponse({ message: "연결 인증을 완료하지 못했습니다." }, { status: 401 });
  if (new URL(request.url).search) return denied();
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/u)?.[1];
  const body = await readJsonBody(request, { maximumBytes: 4096 });
  if (!bearer || !body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) return denied();
  const input = body.value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "callbackUrl,code,siteId,verifier"
    || typeof input.code !== "string" || !SSO_TOKEN_PATTERN.test(input.code)
    || typeof input.verifier !== "string" || !SSO_TOKEN_PATTERN.test(input.verifier)
    || !parseCommunitySsoRequest({ siteId: input.siteId, callbackUrl: input.callbackUrl, codeChallenge: input.verifier, state: input.code, purpose: "ACCOUNT" })) return denied();
  try {
    const limit = await guardAccountOperationAttempt(request, "login", `sso:${input.siteId}`);
    if (!limit.available || !limit.allowed) return noStoreJsonResponse({ message: "잠시 후 다시 시도해 주세요." }, { status: limit.available ? 429 : 503 });
    const identity = await communitySsoRepository().exchange({ siteId: input.siteId as string, callbackUrl: input.callbackUrl as string, code: input.code, verifier: input.verifier, clientSecret: bearer });
    return noStoreJsonResponse({ issuer: hubSsoOrigin(), ...identity });
  } catch { return denied(); }
}
