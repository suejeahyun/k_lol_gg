import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/auth/token";

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
    legacyAdminToken === authConstants.ADMIN_TOKEN_VALUE ||
    isApprovedAdminUserToken(userToken)
  ) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
