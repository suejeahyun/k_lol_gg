import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";
import { applySecurityHeaders } from "@/lib/security-headers";
import { rejectIfBodyTooLarge, rejectIfInvalidOrigin, rejectIfInvalidServerAuth } from "@/lib/security/request-guard";
import { rejectIfRateLimited } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/prisma/client";

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

async function getApprovedAdminRole(token?: string) {
  if (!token) return null;

  const payload = verifyAuthToken(token);

  if (!payload?.userAccountId) return null;

  try {
    const user = await prisma.userAccount.findUnique({
      where: { id: payload.userAccountId },
      select: { role: true, status: true, deletedAt: true, authVersion: true },
    });

    if (!user || user.deletedAt || user.status !== "APPROVED" || (payload.authVersion ?? 0) !== user.authVersion) return null;
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return user.role;
    return null;
  } catch {
    return null;
  }
}

function isSuperAdminApi(pathname: string) {
  return SUPER_ADMIN_API_PATTERNS.some((pattern) => pattern.test(pathname));
}

const PRIVATE_API_PREFIXES = [
  "/api/my-player",
  "/api/participation/",
  "/api/riot/me/",
  "/api/riot/rso/",
  "/api/team-balance/",
  "/api/logs",
];

function withSecurityHeaders(
  response: NextResponse,
  pathname: string,
  req: NextRequest,
) {
  const hasAuthCookie = Boolean(
    req.cookies.get("user_token")?.value ||
      req.cookies.get(authConstants.ADMIN_TOKEN_KEY)?.value,
  );
  if (
    hasAuthCookie ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/auth") ||
    PRIVATE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }

  return applySecurityHeaders(response);
}

async function rejectAdminRequest(req: NextRequest, requireSuperAdmin = false) {
  const legacyAdminToken = req.cookies.get(authConstants.ADMIN_TOKEN_KEY)?.value;
  const userToken = req.cookies.get("user_token")?.value;
  const role = await getApprovedAdminRole(userToken);

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
  const secure = (response: NextResponse) =>
    withSecurityHeaders(response, pathname, req);

  const rateLimited = rejectIfRateLimited(req);
  if (rateLimited) return secure(rateLimited);

  const bodyTooLarge = rejectIfBodyTooLarge(req);
  if (bodyTooLarge) return secure(bodyTooLarge);

  const originRejected = rejectIfInvalidOrigin(req);
  if (originRejected) return secure(originRejected);

  const serverSecretRejected = await rejectIfInvalidServerAuth(req);
  if (serverSecretRejected) return secure(serverSecretRejected);

  if (pathname.startsWith("/api/admin")) {
    if (pathname === "/api/admin/login" || pathname === "/api/admin/logout") {
      return secure(NextResponse.next());
    }

    const rejected = await rejectAdminRequest(req, isSuperAdminApi(pathname));
    if (rejected) return secure(rejected);

    return secure(NextResponse.next());
  }

  if (pathname.startsWith("/api")) {
    return secure(NextResponse.next());
  }

  if (!pathname.startsWith("/admin")) {
    return secure(NextResponse.next());
  }

  if (pathname === "/admin/login") {
    return secure(NextResponse.next());
  }

  const rejected = await rejectAdminRequest(req, false);
  if (!rejected) return secure(NextResponse.next());

  return secure(NextResponse.redirect(new URL("/admin/login", req.url)));
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
