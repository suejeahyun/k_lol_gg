import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  hasSameOrigin,
  noStoreJsonResponse,
  noStoreSecurityHeaders,
  problemForJsonBodyError,
  problemResponse,
  readJsonBody,
  readValidatedTraceId,
} from "@/platform/http";
import {
  ADMIN_SECURITY_PROBLEMS,
  problemForTotpLifecycleReason,
} from "../application/admin-security-http-contract";
import type { AuthSession } from "../domain/auth-session";
import { authorizeAdminSecuritySession } from "./admin-security-authorization";
import { guardAdminTotpCodeAttempt } from "./login-security-guard";
import {
  clearedSessionCookieOptions,
  sessionCookieName,
} from "./runtime-session";

const ADMIN_SECURITY_JSON_LIMIT_BYTES = 512;

export function adminSecurityTraceId(request: Request) {
  return readValidatedTraceId(request.headers);
}

export function adminSecurityLifecycleProblem(request: Request, reason: string) {
  return problemResponse(problemForTotpLifecycleReason(reason), {
    traceId: adminSecurityTraceId(request),
  });
}

export function rejectCrossOriginAdminSecurityMutation(request: Request) {
  const publicOrigin = process.env.V2_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL;
  return hasSameOrigin(request, publicOrigin)
    ? null
    : problemResponse(ADMIN_SECURITY_PROBLEMS.originRequired, {
        traceId: adminSecurityTraceId(request),
      });
}

export async function rejectRateLimitedAdminTotpAttempt(
  request: NextRequest,
  session: AuthSession,
) {
  const decision = await guardAdminTotpCodeAttempt(request, session);
  if (!decision.available) {
    return problemResponse(ADMIN_SECURITY_PROBLEMS.unavailable, {
      traceId: adminSecurityTraceId(request),
    });
  }
  if (decision.allowed) return null;
  return problemResponse(ADMIN_SECURITY_PROBLEMS.tooManyAttempts, {
    headers: { "Retry-After": String(decision.retryAfterSeconds) },
    traceId: adminSecurityTraceId(request),
  });
}

export async function readAdminSecurityJson(request: Request) {
  const body = await readJsonBody(request, {
    maximumBytes: ADMIN_SECURITY_JSON_LIMIT_BYTES,
  });
  return body.ok
    ? body
    : {
        ok: false as const,
        response: problemResponse(problemForJsonBodyError(body.error), {
          traceId: adminSecurityTraceId(request),
        }),
      };
}

export async function requireAdminSecuritySession(
  request: Request,
  options: { requireVerifiedTotp?: boolean } = {},
): Promise<
  | Readonly<{ ok: true; session: AuthSession }>
  | Readonly<{ ok: false; response: Response }>
> {
  if (new URL(request.url).searchParams.size > 0) {
    return {
      ok: false,
      response: problemResponse(ADMIN_SECURITY_PROBLEMS.invalidPayload, {
        traceId: adminSecurityTraceId(request),
      }),
    };
  }
  const authorization = await authorizeAdminSecuritySession(options);
  if (authorization.allowed) return { ok: true, session: authorization.session };

  const problem = authorization.reason === "SESSION_REQUIRED"
    ? ADMIN_SECURITY_PROBLEMS.sessionRequired
    : authorization.reason === "VERIFIED_TOTP_REQUIRED"
      ? ADMIN_SECURITY_PROBLEMS.verifiedTotpRequired
      : ADMIN_SECURITY_PROBLEMS.adminRequired;
  return {
    ok: false,
    response: problemResponse(problem, { traceId: adminSecurityTraceId(request) }),
  };
}

export function adminSecuritySuccess(request: Request, body: unknown, status = 200) {
  return noStoreJsonResponse(body, {
    status,
    traceId: adminSecurityTraceId(request),
  });
}

export function adminSecurityReauthenticationSuccess(
  request: NextRequest,
  body: unknown,
) {
  const traceId = adminSecurityTraceId(request);
  const response = NextResponse.json(body, {
    status: 200,
    headers: noStoreSecurityHeaders({
      contentType: "application/json; charset=utf-8",
      traceId,
    }),
  });
  // Enabling or disabling TOTP increments authVersion and revokes every
  // purpose-bound database session, so the current browser must drop both
  // corresponding cookies as well.
  for (const purpose of ["ACCOUNT", "ADMIN"] as const) {
    response.cookies.set(
      sessionCookieName(purpose),
      "",
      clearedSessionCookieOptions(
        request.nextUrl.protocol === "https:",
        process.env.NODE_ENV,
        purpose,
      ),
    );
  }
  return response;
}
