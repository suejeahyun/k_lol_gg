import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { JoseSessionCodec } from "./jose-session-codec";
import type { AuthSessionSeed } from "../domain/auth-session";

export const SESSION_COOKIE_NAME = "klol_v2_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 60;

function runtimeSecret() {
  const fixtureEnabled = process.env.NODE_ENV !== "production" && process.env.V2_TEST_AUTH_ENABLED === "true";
  return fixtureEnabled ? process.env.V2_TEST_AUTH_SECRET : process.env.V2_SESSION_SECRET;
}

function getCodec() {
  const secret = runtimeSecret();
  if (!secret) return null;
  try {
    return new JoseSessionCodec(secret);
  } catch {
    return null;
  }
}

export async function issueRuntimeSession(seed: AuthSessionSeed) {
  const codec = getCodec();
  if (!codec) throw new Error("Session signing is not configured.");
  return codec.encode(seed, { ttlSeconds: SESSION_MAX_AGE_SECONDS });
}

export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const codec = getCodec();
  if (!codec || !token) return null;
  return codec.decode(token);
});

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    priority: "high" as const,
  };
}

export function clearedSessionCookieOptions(secure: boolean) {
  return { ...sessionCookieOptions(secure), maxAge: 0 };
}
