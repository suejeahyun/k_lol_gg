import { NextRequest, NextResponse } from "next/server";
import {
  clearedSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/modules/auth/infrastructure/runtime-session";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const publicOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!hasSameOrigin(request, publicOrigin)) {
    return NextResponse.json(
      { message: "허용되지 않은 요청 출처입니다." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

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
