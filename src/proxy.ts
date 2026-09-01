import { NextRequest, NextResponse } from "next/server";
import { ADMIN_REQUEST_PATH_HEADER } from "@/modules/auth/application/admin-request-path";
import { normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestPath = normalizeInternalNext(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    "/admin",
  );
  requestHeaders.set(ADMIN_REQUEST_PATH_HEADER, requestPath);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/admin/:path*",
};
