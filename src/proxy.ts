import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";
import { applySecurityHeaders } from "@/lib/security-headers";
import { rejectIfBodyTooLarge, rejectIfInvalidOrigin, rejectIfInvalidServerAuth } from "@/lib/security/request-guard";
import { rejectIfRateLimited } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/prisma/client";
import { isAdminTwoFactorReady } from "@/lib/auth/admin-security-policy";

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
  /^\/api\/admin\/logs(?:\/.*)?$/,
];

async function getApprovedAdminState(token?: string) {
  if (!token) return null;

  const payload = verifyAuthToken(token);

  if (!payload?.userAccountId) return null;

  try {
    const user = await prisma.userAccount.findUnique({
      where: { id: payload.userAccountId },
      select: {
        role: true,
        status: true,
        deletedAt: true,
        authVersion: true,
        adminTotpEnabled: true,
      },
    });

    if (!user || user.deletedAt || user.status !== "APPROVED" || (payload.authVersion ?? 0) !== user.authVersion) return null;
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
      return {
        role: user.role,
        twoFactorEnrollmentRequired: !user.adminTotpEnabled,
        twoFactorReady: isAdminTwoFactorReady({
          role: user.role,
          adminTotpEnabled: user.adminTotpEnabled,
          tokenTotpVerified: payload.adminTotpVerified === true,
        }),
      };
    }
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
  "/api/inhouse-results/",
  "/api/discipline/tasks/",
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

async function rejectAdminRequest(
  req: NextRequest,
  requireSuperAdmin = false,
  allowTwoFactorEnrollment = false,
) {
  const userToken = req.cookies.get("user_token")?.value;
  const state = await getApprovedAdminState(userToken);

  if (
    state &&
    (
      state.twoFactorReady ||
      (allowTwoFactorEnrollment && state.twoFactorEnrollmentRequired)
    ) &&
    (!requireSuperAdmin || state.role === "SUPER_ADMIN")
  ) {
    return null;
  }

  return NextResponse.json(
    {
      ok: false,
      code: state?.twoFactorEnrollmentRequired
        ? "ADMIN_2FA_SETUP_REQUIRED"
        : undefined,
      message: state?.twoFactorEnrollmentRequired
        ? "관리자 2단계 인증 등록이 필요합니다."
        : state && !state.twoFactorReady
          ? "관리자 권한을 다시 인증해주세요."
        : requireSuperAdmin
          ? "최고 관리자 권한이 필요합니다."
          : "관리자 권한이 필요합니다.",
    },
    { status: state ? 403 : requireSuperAdmin ? 403 : 401 },
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

    const allowTwoFactorEnrollment = [
      "/api/admin/2fa/status",
      "/api/admin/2fa/setup",
      "/api/admin/2fa/enable",
    ].includes(pathname);
    const rejected = await rejectAdminRequest(
      req,
      isSuperAdminApi(pathname),
      allowTwoFactorEnrollment,
    );
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

  const allowTwoFactorEnrollment = pathname === "/admin/security";
  const rejected = await rejectAdminRequest(req, false, allowTwoFactorEnrollment);
  if (!rejected) return secure(NextResponse.next());

  const userToken = req.cookies.get("user_token")?.value;
  const state = await getApprovedAdminState(userToken);
  const requestedPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (state?.twoFactorEnrollmentRequired) {
    const securityUrl = new URL("/admin/security", req.url);
    securityUrl.searchParams.set("setup", "required");
    securityUrl.searchParams.set("next", requestedPath);
    return secure(NextResponse.redirect(securityUrl));
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", requestedPath);
  return secure(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
