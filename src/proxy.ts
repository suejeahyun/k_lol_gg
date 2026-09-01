import { NextResponse, type NextRequest } from "next/server";

import {
  buildLegacyHomeDestination,
  buildLegacyPlayersDestination,
} from "@/modules/navigation/application/legacy-player-redirects";

function redirect(destination: string, request: NextRequest) {
  return NextResponse.redirect(new URL(destination, request.url), 308);
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const handledPath = pathname === "/app" || pathname === "/app/players";

  if (!handledPath) return NextResponse.next();

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  if (pathname === "/app") {
    return redirect(
      buildLegacyHomeDestination({ source: searchParams.getAll("source") }),
      request,
    );
  }

  if (pathname === "/app/players") {
    return redirect(
      buildLegacyPlayersDestination({
        q: searchParams.getAll("q"),
        page: searchParams.getAll("page"),
      }),
      request,
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/app/:path*",
};
