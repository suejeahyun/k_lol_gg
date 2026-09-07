import { NextResponse } from "next/server";

import { buildLegacyTeamBalanceDraftDestination } from "@/modules/navigation/application/legacy-team-tool-redirects";

async function redirect(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const url = new URL(request.url);
  const destination = buildLegacyTeamBalanceDraftDestination((await context.params).draftId, { source: url.searchParams.getAll("source") });
  return NextResponse.redirect(new URL(destination, url.origin), 308);
}

export function GET(request: Request, context: { params: Promise<{ draftId: string }> }) { return redirect(request, context); }
export function HEAD(request: Request, context: { params: Promise<{ draftId: string }> }) { return redirect(request, context); }
