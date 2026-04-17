import { NextRequest, NextResponse } from "next/server";
import { authConstants } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

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
  matcher: ["/admin/:path*"],
};