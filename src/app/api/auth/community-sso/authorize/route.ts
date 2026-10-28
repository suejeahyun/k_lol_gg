import { SERVICE_BRAND } from "@/lib/service-brand";
import { guardAccountMutationOrigin } from "@/modules/accounts/infrastructure/account-http";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import { parseCommunitySsoRequest } from "@/modules/auth/domain/community-sso";
import { transactionSessionActor } from "@/modules/auth/domain/transaction-session";
import { authorizeApiRole } from "@/modules/auth/infrastructure/server-authorization";
import { acquireAccountCredentialWork, guardAccountOperationAttempt } from "@/modules/auth/infrastructure/login-security-guard";
import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { communitySsoRepository } from "@/modules/auth/infrastructure/runtime-community-sso";
import { noStoreJsonResponse, readJsonBody } from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (SERVICE_BRAND.id !== "hub") return new Response(null, { status: 404 });
  const originFailure = guardAccountMutationOrigin(request); if (originFailure) return originFailure;
  if (new URL(request.url).search) return noStoreJsonResponse({ message: "연결 요청을 확인해 주세요." }, { status: 400 });
  const authorization = await authorizeApiRole("USER");
  if (!authorization.allowed) return noStoreJsonResponse({ message: "GG HUB에 다시 로그인해 주세요." }, { status: 401 });
  const body = await readJsonBody(request, { maximumBytes: 4096 });
  if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) return noStoreJsonResponse({ message: "연결 요청을 확인해 주세요." }, { status: 400 });
  const { termsAccepted, privacyAccepted, password, ...parameters } = body.value as Record<string, unknown>;
  const input = parseCommunitySsoRequest(parameters);
  if (!input || termsAccepted !== true || privacyAccepted !== true || (password !== undefined && (typeof password !== "string" || password.length > 256))) return noStoreJsonResponse({ message: "연결할 사이트와 동의를 확인해 주세요." }, { status: 400 });
  try {
    const limit = await guardAccountOperationAttempt(request, "login", authorization.session.userId);
    if (!limit.available || !limit.allowed) return noStoreJsonResponse({ message: "잠시 후 다시 시도해 주세요." }, { status: limit.available ? 429 : 503 });
    if (input.purpose === "ADMIN") {
      const context = resolveRuntimeAuthContext(), repository = getRuntimeAccountRepository();
      if (context?.mode !== "database" || !repository || typeof password !== "string" || !password) return noStoreJsonResponse({ message: "GG HUB 비밀번호를 다시 입력해 주세요." }, { status: 400 });
      const account = await context.repository.findAccountById(authorization.session.userId);
      const release = acquireAccountCredentialWork();
      if (!release) return noStoreJsonResponse({ message: "잠시 후 다시 시도해 주세요." }, { status: 429 });
      const verified = await repository.authenticateUser({ loginId: account?.loginId ?? "", password }, new Date()).finally(release);
      if (verified.type !== "authenticated" || verified.session.userId !== authorization.session.userId || verified.session.authVersion !== authorization.session.authVersion) return noStoreJsonResponse({ message: "비밀번호를 확인해 주세요." }, { status: 401 });
    }
    const code = await communitySsoRepository().authorize(input, transactionSessionActor(authorization.session));
    const destination = new URL(input.callbackUrl); destination.search = new URLSearchParams({ code, state: input.state }).toString();
    return noStoreJsonResponse({ redirectTo: destination.href });
  } catch { return noStoreJsonResponse({ message: "사이트 상태나 계정 연결을 확인할 수 없습니다. 다시 시작해 주세요." }, { status: 403 }); }
}
