import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params;
  const target = new URL(`/admin/balance/drafts/${encodeURIComponent(draftId)}`, request.url);
  target.searchParams.set("tab", "recommendations");
  return NextResponse.redirect(target, 308);
}

export const HEAD = GET;
