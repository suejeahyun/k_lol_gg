import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";

function isLegacyAdminTokenEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LEGACY_ADMIN_TOKEN === "true";
}

function isApprovedAdminUserToken(token?: string) {
  if (!token) return false;

  const payload = verifyAuthToken(token);

  return Boolean(
    payload &&
      payload.status === "APPROVED" &&
      (payload.role === "ADMIN" || payload.role === "SUPER_ADMIN"),
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/admin")) {
    if (pathname === "/api/admin/login" || pathname === "/api/admin/logout") {
      return NextResponse.next();
    }

    const legacyAdminToken = req.cookies.get(authConstants.ADMIN_TOKEN_KEY)?.value;
    const userToken = req.cookies.get("user_token")?.value;

    if (
      isApprovedAdminUserToken(userToken) ||
      (isLegacyAdminTokenEnabled() && legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE)
    ) {
      return NextResponse.next();
    }

    return NextResponse.json(
      { ok: false, message: "관리자 권한이 필요합니다." },
      { status: 401 },
    );
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const legacyAdminToken = req.cookies.get(authConstants.ADMIN_TOKEN_KEY)?.value;
  const userToken = req.cookies.get("user_token")?.value;

  if (
    isApprovedAdminUserToken(userToken) ||
    (isLegacyAdminTokenEnabled() && legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE)
  ) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
