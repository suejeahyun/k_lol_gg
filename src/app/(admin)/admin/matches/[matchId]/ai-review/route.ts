import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  const target = new URL(`/admin/matches/${encodeURIComponent(matchId)}/edit`, request.url);
  target.searchParams.set("tab", "ai-review");
  return NextResponse.redirect(target, 308);
}

export const HEAD = GET;
