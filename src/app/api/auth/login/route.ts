import { NextRequest, NextResponse } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import { parseUserLoginInput } from "@/modules/accounts/domain/account-contracts";
import { getRuntimeAccountRepository } from "@/modules/accounts/infrastructure/runtime-account-data";
import {
  guardAccountMutationOrigin,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import {
  acquireAdminLoginWork,
  guardAccountOperationAttempt,
} from "@/modules/auth/infrastructure/login-security-guard";
import {
  issueRuntimeSession,
  sessionCookieName,
  sessionCookieOptions,
} from "@/modules/auth/infrastructure/runtime-session";
import {
  noStoreJsonResponse,
  problemForJsonBodyError,
  problemResponse,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, traceId);
  if (originFailure) return originFailure;
  const body = await readJsonBody(request, { maximumBytes: 4 * 1024 });
  if (!body.ok) return problemResponse(problemForJsonBodyError(body.error), { traceId });
  const input = parseUserLoginInput(body.value);
  if (!input.ok) return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidInput, { traceId });

  const rateLimit = await guardAccountOperationAttempt(request, "login", input.value.loginId);
  if (!rateLimit.available) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  if (!rateLimit.allowed) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }
  const releaseWork = acquireAdminLoginWork();
  if (!releaseWork) {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.rateLimited, {
      traceId,
      headers: { "Retry-After": "1" },
    });
  }
  const repository = getRuntimeAccountRepository();
  if (!repository) {
    releaseWork();
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  }

  try {
    const result = await repository.authenticateUser(input.value, new Date()).finally(releaseWork);
    if (result.type === "invalid-credentials") {
      return problemResponse(ACCOUNT_HTTP_PROBLEMS.invalidCredentials, { traceId });
    }
    const token = await issueRuntimeSession(result.session).catch(() => null);
    if (!token) return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
    const statusMessages = {
      PENDING: "로그인되었습니다. 가입 승인을 기다리고 있습니다.",
      APPROVED: result.account.mustChangePassword
        ? "로그인되었습니다. 임시 비밀번호를 변경해 주세요."
        : "로그인되었습니다.",
      REJECTED: "로그인되었습니다. 계정 화면에서 거절 사유와 다음 절차를 확인해 주세요.",
      SUSPENDED: "로그인되었습니다. 계정 이용 제한 상태를 확인해 주세요.",
    } as const;
    const response = NextResponse.json(
      { message: statusMessages[result.account.status], account: result.account },
      {
        status: 200,
        headers: {
          ...Object.fromEntries(noStoreJsonResponse(null).headers.entries()),
          "Content-Type": "application/json; charset=utf-8",
          ...(traceId ? { "X-Trace-Id": traceId } : {}),
        },
      },
    );
    response.cookies.set(
      sessionCookieName("ACCOUNT"),
      token,
      sessionCookieOptions(request.nextUrl.protocol === "https:", process.env.NODE_ENV, "ACCOUNT"),
    );
    return response;
  } catch {
    releaseWork();
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  }
}
