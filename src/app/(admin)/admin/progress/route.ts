import { NextResponse } from "next/server";
export function GET(request: Request) { return NextResponse.redirect(new URL("/admin/progress/event", request.url), 308); }
export const HEAD = GET;
