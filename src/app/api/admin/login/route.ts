import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminFromRuntime } from "@/modules/auth/infrastructure/admin-login-service";
import {
  issueRuntimeSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/modules/auth/infrastructure/runtime-session";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function hasSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return json({ message: "허용되지 않은 요청 출처입니다." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ message: "JSON 요청만 허용됩니다." }, 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_048) return json({ message: "요청이 너무 큽니다." }, 413);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 2_048) {
    return json({ message: "요청이 너무 큽니다." }, 413);
  }
  const body = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })() as {
    loginId?: unknown;
    password?: unknown;
    totpCode?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return json({ message: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const result = await authenticateAdminFromRuntime({
    loginId: String(body.loginId ?? ""),
    password: String(body.password ?? ""),
    totpCode: body.totpCode == null ? undefined : String(body.totpCode),
  });

  if (!result) {
    return json({ message: "V2 인증 저장소가 아직 연결되지 않았습니다." }, 503);
  }
  if (result.type === "invalid-input") {
    return json({ message: "아이디와 비밀번호를 확인해 주세요." }, 400);
  }
  if (result.type === "invalid-credentials") {
    return json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  if (result.type === "two-factor-required") {
    return json({ requiresTwoFactor: true, message: "인증 앱의 6자리 코드를 입력해 주세요." }, 401);
  }
  if (result.type === "forbidden") {
    const messages = {
      ROLE: "관리자 권한이 없습니다.",
      STATUS: "승인된 관리자 계정만 로그인할 수 있습니다.",
      TOTP: "2단계 인증 코드가 올바르지 않습니다.",
      TOTP_REPLAY: "이미 사용한 인증 코드입니다. 새 코드를 입력해 주세요.",
    } as const;
    return json({ message: messages[result.reason], requiresTwoFactor: result.reason.startsWith("TOTP") }, 403);
  }

  const token = await issueRuntimeSession(result.session);
  const response = json({ success: true, requiresTwoFactorSetup: result.requiresTwoFactorSetup }, 200);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    token,
    sessionCookieOptions(request.nextUrl.protocol === "https:"),
  );
  return response;
}
