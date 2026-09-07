import { NextResponse } from "next/server";

import { buildLegacyTeamBalanceDestination } from "@/modules/navigation/application/legacy-team-tool-redirects";

function redirect(request: Request) {
  const url = new URL(request.url);
  const destination = buildLegacyTeamBalanceDestination({ source: url.searchParams.getAll("source") });
  return NextResponse.redirect(new URL(destination, url.origin), 308);
}

export function GET(request: Request) { return redirect(request); }
export function HEAD(request: Request) { return redirect(request); }
