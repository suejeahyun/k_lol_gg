import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";
import { applySecurityHeaders } from "@/lib/security-headers";
import { rejectIfBodyTooLarge, rejectIfInvalidOrigin, rejectIfInvalidServerAuth } from "@/lib/security/request-guard";
import { rejectIfRateLimited } from "@/lib/security/rate-limit";

const SUPER_ADMIN_API_PATTERNS = [
  /^\/api\/admin\/users\/[^/]+\/role$/,
  /^\/api\/admin\/users\/[^/]+\/reset$/,
  /^\/api\/admin\/users\/[^/]+\/password-reset$/,
  /^\/api\/admin\/discipline-records\/[^/]+\/reset$/,
  /^\/api\/admin\/discipline-records\/user\/[^/]+\/reset$/,
  /^\/api\/admin\/discipline-records\/target\/reset$/,
  /^\/api\/admin\/recruits\/reset-all$/,
  /^\/api\/admin\/recruits\/reset-number$/,
  /^\/api\/admin\/stats\/recalculate$/,
  /^\/api\/admin\/maintenance\//,
];

function isLegacyAdminTokenEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LEGACY_ADMIN_TOKEN === "true";
}

function getApprovedAdminRole(token?: string) {
  if (!token) return null;

  const payload = verifyAuthToken(token);

  if (!payload || payload.status !== "APPROVED") return null;
  if (payload.role === "ADMIN" || payload.role === "SUPER_ADMIN") return payload.role;
  return null;
}

function isSuperAdminApi(pathname: string) {
  return SUPER_ADMIN_API_PATTERNS.some((pattern) => pattern.test(pathname));
}

function withSecurityHeaders(response: NextResponse) {
  return applySecurityHeaders(response);
}

function rejectAdminRequest(req: NextRequest, requireSuperAdmin = false) {
  const legacyAdminToken = req.cookies.get(authConstants.ADMIN_TOKEN_KEY)?.value;
  const userToken = req.cookies.get("user_token")?.value;
  const role = getApprovedAdminRole(userToken);

  if (role && (!requireSuperAdmin || role === "SUPER_ADMIN")) {
    return null;
  }

  if (isLegacyAdminTokenEnabled() && legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      message: requireSuperAdmin ? "최고 관리자 권한이 필요합니다." : "관리자 권한이 필요합니다.",
    },
    { status: requireSuperAdmin ? 403 : 401 },
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const rateLimited = rejectIfRateLimited(req);
  if (rateLimited) return withSecurityHeaders(rateLimited);

  const bodyTooLarge = rejectIfBodyTooLarge(req);
  if (bodyTooLarge) return withSecurityHeaders(bodyTooLarge);

  const originRejected = rejectIfInvalidOrigin(req);
  if (originRejected) return withSecurityHeaders(originRejected);

  const serverSecretRejected = await rejectIfInvalidServerAuth(req);
  if (serverSecretRejected) return withSecurityHeaders(serverSecretRejected);

  if (pathname.startsWith("/api/admin")) {
    if (pathname === "/api/admin/login" || pathname === "/api/admin/logout") {
      return withSecurityHeaders(NextResponse.next());
    }

    const rejected = rejectAdminRequest(req, isSuperAdminApi(pathname));
    if (rejected) return withSecurityHeaders(rejected);

    return withSecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/api")) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!pathname.startsWith("/admin")) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (pathname === "/admin/login") {
    return withSecurityHeaders(NextResponse.next());
  }

  const rejected = rejectAdminRequest(req, false);
  if (!rejected) return withSecurityHeaders(NextResponse.next());

  return withSecurityHeaders(NextResponse.redirect(new URL("/admin/login", req.url)));
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
