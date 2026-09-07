import { NextResponse } from "next/server";

import { buildLegacyRandomTeamDestination } from "@/modules/navigation/application/legacy-team-tool-redirects";

function redirect(request: Request) {
  const url = new URL(request.url);
  const destination = buildLegacyRandomTeamDestination({
    mode: url.searchParams.getAll("mode"),
    source: url.searchParams.getAll("source"),
  });
  return NextResponse.redirect(new URL(destination, url.origin), 308);
}

export function GET(request: Request) {
  return redirect(request);
}

export function HEAD(request: Request) {
  return redirect(request);
}
