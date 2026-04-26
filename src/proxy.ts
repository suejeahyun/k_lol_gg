import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API 요청은 로그인 검사 제외
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // 관리자 페이지가 아니면 통과
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // 로그인 페이지는 통과
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(authConstants.ADMIN_TOKEN_KEY)?.value;

  if (token !== authConstants.ADMIN_TOKEN_VALUE) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};