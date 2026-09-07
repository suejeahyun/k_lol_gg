import { NextRequest, NextResponse } from "next/server";
import { guardExactAccountQuery } from "@/modules/accounts/infrastructure/account-http";
import { readValidatedTraceId } from "@/platform/http";
import { authenticateAdminFromRuntime } from "@/modules/auth/infrastructure/admin-login-service";
import {
  issueRuntimeSession,
  sessionCookieName,
  sessionCookieOptions,
} from "@/modules/auth/infrastructure/runtime-session";
import {
  acquireAdminLoginWork,
  guardAdminLoginAttempt,
} from "@/modules/auth/infrastructure/login-security-guard";
import {
  hasSameOrigin,
} from "@/modules/auth/application/mutation-request-guard";
import { readJsonBody } from "@/platform/http";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: object, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE_HEADERS, ...headers } });
}

export async function POST(request: NextRequest) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const publicOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!hasSameOrigin(request, publicOrigin)) {
    return json({ message: "허용되지 않은 요청 출처입니다." }, 403);
  }
  const bodyRead = await readJsonBody(request, { maximumBytes: 2_048 });
  if (!bodyRead.ok && bodyRead.error === "UNSUPPORTED_MEDIA_TYPE") {
    return json({ message: "JSON 요청만 허용됩니다." }, 415);
  }
  if (!bodyRead.ok && bodyRead.error === "BODY_TOO_LARGE") {
    return json({ message: "요청이 너무 큽니다." }, 413);
  }
  if (!bodyRead.ok) return json({ message: "요청 형식이 올바르지 않습니다." }, 400);
  const body = bodyRead.value as {
    loginId?: unknown;
    password?: unknown;
    totpCode?: unknown;
  } | null;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ message: "요청 형식이 올바르지 않습니다." }, 400);
  }
  const bodyKeys = Object.keys(body).sort();
  if (
    !bodyKeys.includes("loginId") ||
    !bodyKeys.includes("password") ||
    bodyKeys.some((key) => !["loginId", "password", "totpCode"].includes(key)) ||
    typeof body.loginId !== "string" ||
    typeof body.password !== "string" ||
    (body.totpCode !== undefined && typeof body.totpCode !== "string")
  ) {
    return json({ message: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const loginId = body.loginId;
  const rateLimit = await guardAdminLoginAttempt(request, loginId);
  if (!rateLimit.available) {
    return json({ message: "인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  if (!rateLimit.allowed) {
    return json(
      { message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      429,
      { "Retry-After": String(rateLimit.retryAfterSeconds) },
    );
  }

  const releaseWork = acquireAdminLoginWork();
  if (!releaseWork) {
    return json(
      { message: "로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요." },
      429,
      { "Retry-After": "1" },
    );
  }

  const result = await authenticateAdminFromRuntime({
    loginId,
    password: body.password,
    totpCode: body.totpCode,
  }).finally(releaseWork);

  if (!result) {
    return json({ message: "인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  if (result.type === "invalid-input") {
    return json({ message: "아이디와 비밀번호를 확인해 주세요." }, 400);
  }
  if (result.type === "invalid-credentials") {
    return json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  if (result.type === "unavailable") {
    return json({ message: "2단계 인증 저장소를 확인할 수 없습니다." }, 503);
  }
  if (result.type === "two-factor-required") {
    return json({ requiresTwoFactor: true, message: "인증 앱의 6자리 코드를 입력해 주세요." }, 401);
  }
  if (result.type === "forbidden") {
    const messages = {
      ROLE: "관리자 권한이 없습니다.",
      STATUS: "승인된 관리자 계정만 로그인할 수 있습니다.",
      PASSWORD_CHANGE: "일반 로그인에서 임시 비밀번호를 먼저 변경해 주세요.",
      TOTP: "2단계 인증 코드가 올바르지 않습니다.",
      TOTP_REPLAY: "이미 사용한 인증 코드입니다. 새 코드를 입력해 주세요.",
    } as const;
    return json({ message: messages[result.reason], requiresTwoFactor: result.reason.startsWith("TOTP") }, 403);
  }

  const token = await issueRuntimeSession(result.session).catch(() => null);
  if (!token) {
    return json({ message: "로그인할 수 없습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  const response = json({ success: true, requiresTwoFactorSetup: result.requiresTwoFactorSetup }, 200);
  response.cookies.set(
    sessionCookieName("ADMIN"),
    token,
    sessionCookieOptions(request.nextUrl.protocol === "https:", process.env.NODE_ENV, "ADMIN"),
  );
  return response;
}
