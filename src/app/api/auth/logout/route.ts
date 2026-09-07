import { NextRequest, NextResponse } from "next/server";

import { ACCOUNT_HTTP_PROBLEMS } from "@/modules/accounts/application/account-http-problems";
import {
  guardAccountMutationOrigin,
  guardEmptyAccountBody,
  guardExactAccountQuery,
} from "@/modules/accounts/infrastructure/account-http";
import {
  clearedSessionCookieOptions,
  revokeRuntimeSessionToken,
  sessionCookieName,
} from "@/modules/auth/infrastructure/runtime-session";
import { noStoreSecurityHeaders, problemResponse, readValidatedTraceId } from "@/platform/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = readValidatedTraceId(request.headers);
  const queryFailure = guardExactAccountQuery(request, [], traceId);
  if (queryFailure) return queryFailure;
  const originFailure = guardAccountMutationOrigin(request, traceId);
  if (originFailure) return originFailure;
  const bodyFailure = await guardEmptyAccountBody(request, traceId);
  if (bodyFailure) return bodyFailure;
  const accountCookieName = sessionCookieName("ACCOUNT");
  const result = await revokeRuntimeSessionToken(
    request.cookies.get(accountCookieName)?.value,
    "ACCOUNT",
  );
  if (result === "unavailable") {
    return problemResponse(ACCOUNT_HTTP_PROBLEMS.unavailable, { traceId });
  }
  const response = new NextResponse(null, {
    status: 204,
    headers: noStoreSecurityHeaders({ traceId }),
  });
  response.cookies.set(
    accountCookieName,
    "",
    clearedSessionCookieOptions(
      request.nextUrl.protocol === "https:",
      process.env.NODE_ENV,
      "ACCOUNT",
    ),
  );
  return response;
}
