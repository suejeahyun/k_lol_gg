import { NextRequest, NextResponse } from "next/server";
import {
  clearedSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/modules/auth/infrastructure/runtime-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = request.headers.get("accept")?.includes("text/html")
    ? NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 })
    : NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    clearedSessionCookieOptions(request.nextUrl.protocol === "https:"),
  );
  return response;
}
