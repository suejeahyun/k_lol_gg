import { NextRequest, NextResponse } from "next/server";
import {
  clearedSessionCookieOptions,
  revokeRuntimeSessionToken,
  sessionCookieName,
} from "@/modules/auth/infrastructure/runtime-session";
import { hasSameOrigin } from "@/modules/auth/application/mutation-request-guard";
import {
  guardEmptyAccountBody,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import { readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const queryFailure = guardExactAccountQuery(
    request,
    [],
    readValidatedTraceId(request.headers),
  );
  if (queryFailure) return queryFailure;
  const traceId = readValidatedTraceId(request.headers);
  const bodyFailure = await guardEmptyAccountBody(request, traceId);
  if (bodyFailure) return bodyFailure;
  const publicOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (!hasSameOrigin(request, publicOrigin)) {
    return NextResponse.json(
      { message: "허용되지 않은 요청 출처입니다." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const adminCookieName = sessionCookieName("ADMIN");
  const revocation = await revokeRuntimeSessionToken(
    request.cookies.get(adminCookieName)?.value,
    "ADMIN",
  );
  const response = revocation === "unavailable"
    ? NextResponse.json(
        { success: false, message: "세션을 완전히 폐기할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    : request.headers.get("accept")?.includes("text/html")
      ? NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 })
      : NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  response.headers.set("Cache-Control", "no-store");
  if (revocation !== "unavailable") {
    response.cookies.set(
      adminCookieName,
      "",
      clearedSessionCookieOptions(
        request.nextUrl.protocol === "https:",
        process.env.NODE_ENV,
        "ADMIN",
      ),
    );
  }
  return response;
}
