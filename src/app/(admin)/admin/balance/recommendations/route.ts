import { NextResponse } from "next/server";

export function GET(request: Request) {
  const source = new URL(request.url);
  const target = new URL("/admin/balance/drafts", source);
  target.searchParams.set("view", "recommendations");
  return NextResponse.redirect(target, 308);
}

export const HEAD = GET;
