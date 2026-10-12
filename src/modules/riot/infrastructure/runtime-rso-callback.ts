import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthSession } from "@/modules/auth/domain/auth-session";
import { ACCOUNT_SESSION_COOKIE_NAME } from "@/modules/auth/infrastructure/session-constants";
import { hashSessionToken } from "@/modules/auth/infrastructure/session-token-hash";
import { resolveRuntimeAuthContext } from "@/modules/auth/infrastructure/runtime-auth-context";
import { createRsoCallbackBinding, resolveRsoCallbackSession, RSO_CALLBACK_COOKIE, rsoCallbackCookieOptions } from "./riot-rso-callback-binding";

function cookieOptions(request: Request) {
  return rsoCallbackCookieOptions(process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:");
}

export async function attachRsoCallbackBinding(response: Response, request: Request, session: AuthSession, authorizationUrl: string) {
  const secret = process.env.RIOT_RSO_STATE_SECRET;
  const token = (await cookies()).get(ACCOUNT_SESSION_COOKIE_NAME)?.value;
  const state = new URL(authorizationUrl).searchParams.get("state");
  if (!secret || !token || !state) throw new Error("RSO_CALLBACK_UNAVAILABLE");
  const next = new NextResponse(response.body, { status: response.status, headers: response.headers });
  next.cookies.set(RSO_CALLBACK_COOKIE, createRsoCallbackBinding({ session, tokenHash: hashSessionToken(token), state, secret }), cookieOptions(request));
  return next;
}

export async function getRsoCallbackSession(state: string) {
  const context = resolveRuntimeAuthContext();
  if (context?.mode !== "database") return null;
  return resolveRsoCallbackSession({
    binding: (await cookies()).get(RSO_CALLBACK_COOKIE)?.value, state,
    secret: process.env.RIOT_RSO_STATE_SECRET, repository: context.repository,
  });
}

export function clearRsoCallbackBinding(response: Response, request: Request) {
  const next = new NextResponse(response.body, { status: response.status, headers: response.headers });
  next.headers.set("Cache-Control", "no-store");
  next.cookies.set(RSO_CALLBACK_COOKIE, "", { ...cookieOptions(request), maxAge: 0 });
  return next;
}
