import { NextRequest, NextResponse } from "next/server";

import { ADMIN_REQUEST_PATH_HEADER } from "@/modules/auth/application/admin-request-path";
import { normalizeInternalNext } from "@/modules/auth/application/normalize-internal-next";
import {
  buildLegacyHomeDestination,
  buildLegacyPlayersDestination,
} from "@/modules/navigation/application/legacy-player-redirects";

function permanentSameOriginRedirect(destination: string, request: NextRequest) {
  return NextResponse.redirect(new URL(destination, request.url), 308);
}

function continueWithTrustedAdminPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestPath = normalizeInternalNext(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    "/admin",
  );
  requestHeaders.set(ADMIN_REQUEST_PATH_HEADER, requestPath);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return continueWithTrustedAdminPath(request);
  }

  const handledLegacyPath = pathname === "/app" || pathname === "/app/players";
  if (!handledLegacyPath) return NextResponse.next();

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  if (pathname === "/app") {
    return permanentSameOriginRedirect(
      buildLegacyHomeDestination({ source: searchParams.getAll("source") }),
      request,
    );
  }

  return permanentSameOriginRedirect(
    buildLegacyPlayersDestination({
      q: searchParams.getAll("q"),
      page: searchParams.getAll("page"),
    }),
    request,
  );
}

export const config = {
  matcher: ["/admin/:path*", "/app/:path*"],
};
