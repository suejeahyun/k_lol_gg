import { NextRequest, NextResponse } from "next/server";

import { ADMIN_REQUEST_PATH_HEADER } from "@/modules/auth/application/admin-request-path";
import {
  normalizeAccountNext,
  normalizeInternalNext,
} from "@/modules/auth/application/normalize-internal-next";
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

  const accountLegacyDestinations: Record<string, string> = {
    "/app/signup": "/signup",
    "/app/account": "/account",
    "/app/me": "/account",
    "/account/tier": "/account?tab=player",
    "/me/player": "/account?tab=player",
    "/app/admin/users": "/admin/users",
    "/admin/player-approvals": "/admin/users?status=PENDING",
  };
  const accountLegacyDestination = accountLegacyDestinations[pathname];
  if (accountLegacyDestination) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (searchParams.size > 0) return new Response(null, { status: 400 });
    return permanentSameOriginRedirect(accountLegacyDestination, request);
  }

  if (pathname === "/app/login") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if ([...searchParams.keys()].some((key) => key !== "next") || searchParams.getAll("next").length > 1) {
      return new Response(null, { status: 400 });
    }
    const rawNext = searchParams.get("next") ?? undefined;
    const safeNext = normalizeAccountNext(rawNext);
    return permanentSameOriginRedirect(
      safeNext === "/account" && rawNext === undefined
        ? "/login"
        : `/login?next=${encodeURIComponent(safeNext)}`,
      request,
    );
  }

  const legacyAdminUserMatch = /^\/app\/admin\/users\/([1-9][0-9]{0,9}|[0-9a-f-]{36})$/i.exec(pathname);
  if (legacyAdminUserMatch) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (searchParams.size > 0) return new Response(null, { status: 400 });
    return permanentSameOriginRedirect(`/admin/users/${legacyAdminUserMatch[1]}`, request);
  }

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
  matcher: ["/admin/:path*", "/app/:path*", "/account/tier", "/me/player"],
};
