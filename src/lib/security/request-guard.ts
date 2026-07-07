import { NextRequest, NextResponse } from "next/server";
import { readRequestBodyForSignature, verifySignedRequest } from "@/lib/security/hmac";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

export function getRequiredHeaderSecret(pathname: string) {

  if (pathname.startsWith("/api/kakao") && process.env.SECURITY_REQUIRE_KAKAO_SECRET === "true") {
    return (
      process.env.KAKAO_RECRUIT_SECRET ||
      process.env.KAKAO_OPENCHAT_SECRET ||
      process.env.KAKAO_SEARCH_LAYER_SECRET ||
      null
    );
  }

  return null;
}

function allowLegacyQuerySecret() {
  return process.env.SECURITY_ALLOW_QUERY_SECRET === "true" || process.env.NODE_ENV !== "production";
}

export function getReceivedServerSecret(request: NextRequest) {
  const headerSecret =
    request.headers.get("x-klol-secret") ||
    request.headers.get("x-bot-secret") ||
    request.headers.get("x-kakao-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";

  if (headerSecret) return headerSecret;

  // Query string secrets are easy to leak through logs, browser history, proxies, and analytics.
  // Keep this only as a temporary local/development compatibility path.
  if (allowLegacyQuerySecret()) {
    return request.nextUrl.searchParams.get("secret") || "";
  }

  return "";
}

export function hasValidServerSecret(request: NextRequest, pathname: string) {
  const expected = getRequiredHeaderSecret(pathname);
  if (!expected) return true;

  const received = getReceivedServerSecret(request);
  return received.length > 0 && received === expected;
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

  if (!hmacRequired && hasValidServerSecret(request, pathname)) return null;

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
