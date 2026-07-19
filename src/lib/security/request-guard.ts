import { NextRequest, NextResponse } from "next/server";
import { readRequestBodyForSignature, safeEqualText, verifySignedRequest } from "@/lib/security/hmac";
import { allowQueryStringSecret } from "@/lib/security/secrets";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const JSON_IMPORT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const BOT_MAX_BODY_BYTES = 256 * 1024;

function normalizeOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

export function getRequestOrigin(request: NextRequest) {
  return normalizeOrigin(request.headers.get("origin"));
}

export function getRequestHostOrigin(request: NextRequest) {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

export function getAllowedOrigins(request: NextRequest) {
  const values = new Set<string>();
  values.add(request.nextUrl.origin);
  values.add(getRequestHostOrigin(request));

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    const normalized = normalizeOrigin(baseUrl);
    if (normalized) values.add(normalized);
  }

  const extra = process.env.SECURITY_ALLOWED_ORIGINS;
  if (extra) {
    for (const item of extra.split(",")) {
      const normalized = normalizeOrigin(item.trim());
      if (normalized) values.add(normalized);
    }
  }

  return values;
}

export function rejectIfInvalidOrigin(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return null;

  const origin = getRequestOrigin(request);

  // Server-to-server requests such as Kakao bot calls may not include Origin.
  // Browser cross-site requests include Origin and are blocked unless explicitly allowed.
  if (!origin) return null;

  if (getAllowedOrigins(request).has(origin)) return null;

  return NextResponse.json(
    { ok: false, message: "허용되지 않은 요청 출처입니다." },
    { status: 403 },
  );
}

type KakaoSecretKind = "recruit" | "openchat" | "search-player";

function getKakaoSecretKind(pathname: string): KakaoSecretKind | null {
  if (!pathname.startsWith("/api/kakao/")) return null;

  if (pathname === "/api/kakao/web-player-search") return null;
  if (pathname === "/api/kakao/search-player") return "search-player";
  if (pathname === "/api/kakao/openchat" || pathname === "/api/kakao/scheduled-notice") {
    return "openchat";
  }

  return "recruit";
}

function getKakaoSecret(kind: KakaoSecretKind) {
  if (kind === "recruit") return process.env.KAKAO_RECRUIT_SECRET?.trim() || null;
  if (kind === "openchat") return process.env.KAKAO_OPENCHAT_SECRET?.trim() || null;

  return (
    process.env.KAKAO_SEARCH_PLAYER_SECRET?.trim() ||
    process.env.KAKAO_OPENCHAT_SECRET?.trim() ||
    null
  );
}

export function getRequiredHeaderSecret(pathname: string) {
  if (process.env.SECURITY_REQUIRE_KAKAO_SECRET !== "true") return null;

  const kind = getKakaoSecretKind(pathname);
  return kind ? getKakaoSecret(kind) : null;
}

export function getReceivedServerSecret(request: NextRequest) {
  const kind = getKakaoSecretKind(request.nextUrl.pathname);
  const kakaoHeader = kind
    ? request.headers.get(`x-kakao-${kind}-secret`)
    : null;
  const headerSecret =
    kakaoHeader ||
    request.headers.get("x-klol-secret") ||
    request.headers.get("x-bot-secret") ||
    request.headers.get("x-kakao-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (headerSecret) return headerSecret;

  // Query string secrets are easy to leak through logs, browser history, proxies, and analytics.
  // Keep this only as a temporary local/development compatibility path.
  if (allowQueryStringSecret()) {
    return request.nextUrl.searchParams.get("secret") || "";
  }

  return "";
}

export function hasValidServerSecret(request: NextRequest, pathname: string) {
  const expected = getRequiredHeaderSecret(pathname);
  if (!expected) return true;

  const received = getReceivedServerSecret(request);
  return received.length > 0 && safeEqualText(received, expected);
}

function getMaxBodyBytes(pathname: string) {
  if (pathname === "/api/matches/import-lol-result") return JSON_IMPORT_MAX_BODY_BYTES;
  if (pathname.startsWith("/api/images") || pathname.startsWith("/api/gallery-images")) {
    return JSON_IMPORT_MAX_BODY_BYTES;
  }
  if (pathname.startsWith("/api/kakao/")) return BOT_MAX_BODY_BYTES;
  return DEFAULT_MAX_BODY_BYTES;
}

export function rejectIfBodyTooLarge(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return null;

  const rawLength = request.headers.get("content-length");
  if (!rawLength) return null;

  const contentLength = Number(rawLength);
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return NextResponse.json(
      { ok: false, message: "요청 본문 크기가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const maxBytes = getMaxBodyBytes(request.nextUrl.pathname);
  if (contentLength <= maxBytes) return null;

  return NextResponse.json(
    {
      ok: false,
      message: "요청 본문이 너무 큽니다.",
      maxBytes,
    },
    { status: 413 },
  );
}

export async function hasValidServerHmacSignature(request: NextRequest, pathname: string) {
  const expected = getRequiredHeaderSecret(pathname);
  if (!expected) return true;

  const timestamp = request.headers.get("x-klol-timestamp");
  const signature = request.headers.get("x-klol-signature");
  const body = await readRequestBodyForSignature(request);

  return verifySignedRequest({
    secret: expected,
    timestamp,
    signature,
    body,
  });
}

export async function rejectIfInvalidServerAuth(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const expected = getRequiredHeaderSecret(pathname);
  if (!expected) return null;

  const hmacRequired = process.env.SECURITY_REQUIRE_HMAC === "true";
  const hmacValid = await hasValidServerHmacSignature(request, pathname);
  if (hmacValid) return null;

  if (!hmacRequired) {
    if (hasValidServerSecret(request, pathname)) return null;

    // Several Kakao clients send the legacy secret in a JSON body. The route
    // handlers validate that value after parsing the body, so do not reject an
    // otherwise credential-less request here before its route-level guard runs.
    if (!getReceivedServerSecret(request)) return null;
  }

  return NextResponse.json(
    { ok: false, message: "서버 인증 정보가 올바르지 않습니다." },
    { status: 401 },
  );
}
export function rejectIfInvalidServerSecret(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const expected = getRequiredHeaderSecret(pathname);
  if (!expected) return null;

  if (hasValidServerSecret(request, pathname)) return null;

  return NextResponse.json(
    { ok: false, message: "서버 인증 정보가 올바르지 않습니다." },
    { status: 401 },
  );
}
