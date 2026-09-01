import { NextResponse } from "next/server";

import { buildLegacySeasonApplicationDestination } from "@/modules/navigation/application/legacy-application-redirects";

function redirect(request: Request) {
  const url = new URL(request.url);
  const destination = buildLegacySeasonApplicationDestination({
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
