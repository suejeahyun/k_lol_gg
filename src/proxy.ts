import { NextRequest, NextResponse } from "next/server";
import { SERVICE_BRAND } from "@/lib/service-brand";
import { resolveHubRoute } from "@/lib/hub-route-policy";

import { ADMIN_REQUEST_PATH_HEADER } from "@/modules/auth/application/admin-request-path";
import { resolveAdminLegacyDestination } from "@/modules/admin/domain/admin-route-contracts";
import {
  normalizeAccountNext,
  normalizeInternalNext,
} from "@/modules/auth/application/normalize-internal-next";
import {
  buildLegacyHomeDestination,
  buildLegacyPlayersDestination,
} from "@/modules/navigation/application/legacy-player-redirects";
import { buildLegacyStatisticsDestination } from "@/modules/navigation/application/legacy-statistics-redirects";

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

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (SERVICE_BRAND.id === "hub") {
    const decision = resolveHubRoute(pathname, request.method, process.env.NODE_ENV === "development");
    if (decision.kind === "not-found") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    if (decision.kind === "method-not-allowed") return new Response(null, { status: 405, headers: { Allow: decision.allow.join(", "), "Cache-Control": "no-store" } });
    if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.destination, request.url), 307);
    return pathname.startsWith("/admin/") ? continueWithTrustedAdminPath(request) : NextResponse.next();
  }

  if (SERVICE_BRAND.id === "community") {
    const { requireCommunityPublicationAccess } = await import("@/modules/community-sites/infrastructure/publication-access");
    const publicationFailure = await requireCommunityPublicationAccess(request);
    if (publicationFailure) return publicationFailure;
    const { requireCommunityModuleForRequest } = await import("@/modules/community-sites/infrastructure/module-access");
    const moduleFailure = await requireCommunityModuleForRequest(request);
    if (moduleFailure) return moduleFailure;
  }

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

  const legacyStatisticsPath =
    pathname === "/statistics" ||
    pathname === "/app/rankings" ||
    (pathname === "/app/matches" && searchParams.get("tab") === "rankings");
  if (legacyStatisticsPath) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return permanentSameOriginRedirect(buildLegacyStatisticsDestination({
      seasonId: searchParams.getAll("seasonId"),
      minParticipation: searchParams.getAll("minParticipation"),
    }), request);
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

  const reviewedAdminDestination = resolveAdminLegacyDestination(pathname);
  if (reviewedAdminDestination) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return permanentSameOriginRedirect(reviewedAdminDestination, request);
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
  // Match APIs and assets too: the independently deployed hub has an explicit
  // route surface. Child services retain the existing routing behavior above.
  matcher: ["/:path*"],
};
